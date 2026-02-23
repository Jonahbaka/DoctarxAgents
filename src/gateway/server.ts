// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Gateway Server
// WebSocket + HTTP API for commanding the agent swarm
// Protocol-compatible with OpenClaw gateway pattern
// ═══════════════════════════════════════════════════════════════

import { WebSocketServer, WebSocket } from 'ws';
import express, { Request, Response } from 'express';
import http from 'http';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import { GatewayMessage, LoggerHandle, TaskSchema } from '../core/types.js';
import { CONFIG } from '../core/config.js';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  role: string;
  connectedAt: Date;
  lastPing: Date;
}

export class GatewayServer extends EventEmitter {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private logger: LoggerHandle;
  private messageLog: GatewayMessage[] = [];

  constructor(logger: LoggerHandle) {
    super();
    this.logger = logger;
    this.app = express();
    this.app.use(express.json());

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.setupHTTPRoutes();
    this.setupWebSocket();
  }

  // ── HTTP API Routes ──

  private setupHTTPRoutes(): void {
    // Auth middleware
    this.app.use((req: Request, res: Response, next) => {
      const token = req.headers['x-gateway-secret'] as string;
      if (token !== CONFIG.gateway.secret && req.path !== '/health') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });

    // Health check (no auth required)
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'operational',
        uptime: process.uptime(),
        clients: this.clients.size,
        timestamp: new Date().toISOString(),
      });
    });

    // Submit a task
    this.app.post('/api/task', (req: Request, res: Response) => {
      try {
        const task = TaskSchema.parse(req.body);
        const taskId = uuid();
        this.emit('task:submit', { id: taskId, ...task });
        this.broadcast('task:created', { id: taskId, ...task });
        res.json({ id: taskId, status: 'queued' });
      } catch (err) {
        res.status(400).json({ error: 'Invalid task schema', details: String(err) });
      }
    });

    // Get system state
    this.app.get('/api/state', (_req: Request, res: Response) => {
      this.emit('state:request', (state: unknown) => {
        res.json(state);
      });
    });

    // Get agents
    this.app.get('/api/agents', (_req: Request, res: Response) => {
      this.emit('agents:request', (agents: unknown) => {
        res.json(agents);
      });
    });

    // Get tasks
    this.app.get('/api/tasks', (_req: Request, res: Response) => {
      this.emit('tasks:request', (tasks: unknown) => {
        res.json(tasks);
      });
    });

    // Get execution log
    this.app.get('/api/log', (_req: Request, res: Response) => {
      this.emit('log:request', (log: unknown) => {
        res.json(log);
      });
    });

    // Get memory stats
    this.app.get('/api/memory/stats', (_req: Request, res: Response) => {
      this.emit('memory:stats:request', (stats: unknown) => {
        res.json(stats);
      });
    });

    // Patient lookup
    this.app.get('/api/patient/:id', (req: Request, res: Response) => {
      this.emit('patient:request', req.params.id, (patient: unknown) => {
        if (patient) res.json(patient);
        else res.status(404).json({ error: 'Patient not found' });
      });
    });

    // Trigger self-evaluation
    this.app.post('/api/self-eval', (_req: Request, res: Response) => {
      this.emit('self-eval:trigger');
      res.json({ status: 'triggered' });
    });

    // Gateway message log
    this.app.get('/api/messages', (_req: Request, res: Response) => {
      const limit = parseInt(String(_req.query?.limit) || '50');
      res.json(this.messageLog.slice(-limit));
    });

    // Connected clients
    this.app.get('/api/clients', (_req: Request, res: Response) => {
      const clientList = Array.from(this.clients.values()).map(c => ({
        id: c.id,
        role: c.role,
        connectedAt: c.connectedAt,
        lastPing: c.lastPing,
      }));
      res.json(clientList);
    });
  }

  // ── WebSocket ──

  private setupWebSocket(): void {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuid();
      const client: ConnectedClient = {
        id: clientId,
        ws,
        role: 'observer',
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      this.clients.set(clientId, client);
      this.logger.info(`WS client connected: ${clientId} from ${req.socket.remoteAddress}`);

      // Send welcome
      this.sendToClient(clientId, {
        id: uuid(),
        type: 'event',
        channel: 'system',
        payload: { event: 'connected', clientId },
        timestamp: new Date(),
      });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as GatewayMessage;
          client.lastPing = new Date();
          this.handleMessage(clientId, msg);
        } catch (err) {
          this.sendToClient(clientId, {
            id: uuid(),
            type: 'response',
            channel: 'error',
            payload: { error: 'Invalid message format' },
            timestamp: new Date(),
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.logger.info(`WS client disconnected: ${clientId}`);
      });

      ws.on('pong', () => {
        client.lastPing = new Date();
      });
    });

    // Heartbeat every 30s
    setInterval(() => {
      for (const [id, client] of this.clients) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.clients.delete(id);
        }
      }
    }, 30000);
  }

  private handleMessage(clientId: string, msg: GatewayMessage): void {
    this.messageLog.push(msg);
    if (this.messageLog.length > 1000) this.messageLog = this.messageLog.slice(-500);

    const client = this.clients.get(clientId);
    if (!client) return;

    // Auth check for commands
    if (msg.type === 'command' && msg.auth?.token !== CONFIG.gateway.secret) {
      this.sendToClient(clientId, {
        id: uuid(),
        type: 'response',
        channel: 'error',
        payload: { error: 'Unauthorized command' },
        timestamp: new Date(),
      });
      return;
    }

    switch (msg.type) {
      case 'command':
        this.emit('gateway:command', msg, (response: unknown) => {
          this.sendToClient(clientId, {
            id: uuid(),
            type: 'response',
            channel: msg.channel,
            payload: { result: response },
            timestamp: new Date(),
          });
        });
        break;

      case 'query':
        this.emit('gateway:query', msg, (response: unknown) => {
          this.sendToClient(clientId, {
            id: uuid(),
            type: 'response',
            channel: msg.channel,
            payload: { result: response },
            timestamp: new Date(),
          });
        });
        break;

      case 'event':
        // Rebroadcast events to all other clients
        this.broadcastExcept(clientId, msg.channel, msg.payload);
        break;
    }
  }

  // ── Broadcast ──

  broadcast(channel: string, payload: Record<string, unknown>): void {
    const msg: GatewayMessage = {
      id: uuid(),
      type: 'event',
      channel,
      payload,
      timestamp: new Date(),
    };

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(msg));
      }
    }
  }

  private broadcastExcept(excludeId: string, channel: string, payload: Record<string, unknown>): void {
    const msg: GatewayMessage = {
      id: uuid(),
      type: 'event',
      channel,
      payload,
      timestamp: new Date(),
    };

    for (const [id, client] of this.clients) {
      if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(msg));
      }
    }
  }

  private sendToClient(clientId: string, msg: GatewayMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(msg));
    }
  }

  // ── Lifecycle ──

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(CONFIG.gateway.port, CONFIG.gateway.host, () => {
        this.logger.info(`Gateway listening on ${CONFIG.gateway.host}:${CONFIG.gateway.port}`);
        this.logger.info(`  HTTP API: http://${CONFIG.gateway.host}:${CONFIG.gateway.port}/api`);
        this.logger.info(`  WebSocket: ws://${CONFIG.gateway.host}:${CONFIG.gateway.port}/ws`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Close all WS connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          this.logger.info('Gateway stopped');
          resolve();
        });
      });
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getApp(): express.Application {
    return this.app;
  }
}
