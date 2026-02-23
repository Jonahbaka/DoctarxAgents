// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Daemon Loop
// The cybernetic heartbeat — schedules tasks, runs self-eval,
// manages agent lifecycle, and orchestrates the swarm
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'eventemitter3';
import { v4 as uuid } from 'uuid';
import { LoggerHandle, Task, TaskType, TaskPriority } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { Orchestrator } from '../core/orchestrator.js';
import { VectorStore } from '../memory/vector-store.js';
import { GatewayServer } from '../gateway/server.js';
import type { SelfHealingEngine } from '../healing/self-healer.js';
import type { ChannelManager } from '../channels/manager.js';
import type { ConsciousnessEngine } from '../consciousness/index.js';

interface ScheduledJob {
  id: string;
  name: string;
  taskType: TaskType;
  priority: TaskPriority;
  cronDescription: string;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date;
  enabled: boolean;
  payload: Record<string, unknown>;
}

export class DaemonLoop extends EventEmitter {
  private orchestrator: Orchestrator;
  private memory: VectorStore;
  private gateway: GatewayServer;
  private logger: LoggerHandle;

  // Optional subsystems (injected after construction)
  private healingEngine: SelfHealingEngine | null = null;
  private channelManager: ChannelManager | null = null;
  private consciousnessEngine: ConsciousnessEngine | null = null;

  private running = false;
  private tickCount = 0;
  private startedAt: Date | null = null;

  private mainLoopTimer: ReturnType<typeof setInterval> | null = null;
  private selfEvalTimer: ReturnType<typeof setInterval> | null = null;
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private jobTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  // Task queue for sequential processing
  private taskQueue: Array<{
    task: Task;
    resolve: (value: unknown) => void;
  }> = [];
  private processing = false;

  constructor(
    orchestrator: Orchestrator,
    memory: VectorStore,
    gateway: GatewayServer,
    logger: LoggerHandle
  ) {
    super();
    this.orchestrator = orchestrator;
    this.memory = memory;
    this.gateway = gateway;
    this.logger = logger;

    this.wireGatewayEvents();
    this.registerDefaultJobs();
  }

  // ── Subsystem Injection ──

  setHealingEngine(engine: SelfHealingEngine): void {
    this.healingEngine = engine;
    this.addJob({
      name: 'Health Check',
      taskType: 'health_check',
      priority: 'medium',
      cronDescription: 'Every 30 seconds',
      intervalMs: CONFIG.healing.healthCheckIntervalMs,
      payload: { action: 'health_check' },
    });
    this.addJob({
      name: 'Circuit Breaker Evaluation',
      taskType: 'health_check',
      priority: 'low',
      cronDescription: 'Every 60 seconds',
      intervalMs: 60000,
      payload: { action: 'circuit_breaker_eval' },
    });
    this.addJob({
      name: 'Dependency Audit',
      taskType: 'health_check',
      priority: 'low',
      cronDescription: 'Every 6 hours',
      intervalMs: 6 * 3600000,
      payload: { action: 'dependency_audit' },
    });
    this.logger.info('Self-healing engine injected into daemon');
  }

  setChannelManager(manager: ChannelManager): void {
    this.channelManager = manager;
    // Wire inbound channel messages → task queue
    manager.on('message', (msg: Record<string, unknown>) => {
      const task = this.orchestrator.createTask(
        'messaging_inbound',
        'medium',
        `Inbound message from ${msg.channelType}`,
        `Message from ${msg.senderId}: ${(msg.content as string || '').slice(0, 200)}`,
        { message: msg }
      );
      this.enqueueTask(task);
    });
    this.logger.info('Channel manager injected into daemon');
  }

  setConsciousnessEngine(engine: ConsciousnessEngine): void {
    this.consciousnessEngine = engine;
    this.addJob({
      name: 'Introspection Cycle',
      taskType: 'introspection',
      priority: 'low',
      cronDescription: 'Every 1 hour',
      intervalMs: CONFIG.consciousness.introspectionIntervalMs,
      payload: { action: 'introspection' },
    });
    this.logger.info('Consciousness engine injected into daemon');
  }

  // ── Wire Gateway → Orchestrator Events ──

  private wireGatewayEvents(): void {
    // Task submission from gateway
    this.gateway.on('task:submit', async (data: Record<string, unknown>) => {
      const task = this.orchestrator.createTask(
        data.type as TaskType,
        data.priority as TaskPriority || 'medium',
        data.title as string,
        data.description as string || '',
        data.payload as Record<string, unknown> || {}
      );
      await this.enqueueTask(task);
    });

    // State queries
    this.gateway.on('state:request', (callback: (state: unknown) => void) => {
      callback(this.getState());
    });

    this.gateway.on('agents:request', (callback: (agents: unknown) => void) => {
      callback(this.orchestrator.getAgents());
    });

    this.gateway.on('tasks:request', (callback: (tasks: unknown) => void) => {
      callback(this.orchestrator.getTasks());
    });

    this.gateway.on('log:request', (callback: (log: unknown) => void) => {
      callback(this.memory.getExecutionLog(undefined, 100));
    });

    this.gateway.on('memory:stats:request', (callback: (stats: unknown) => void) => {
      callback(this.memory.getStats());
    });

    this.gateway.on('patient:request', (patientId: string, callback: (patient: unknown) => void) => {
      callback(this.memory.getPatient(patientId));
    });

    this.gateway.on('self-eval:trigger', () => {
      this.triggerSelfEvaluation();
    });

    this.gateway.on('gateway:command', (msg: Record<string, unknown>, callback: (result: unknown) => void) => {
      this.handleCommand(msg, callback);
    });

    // Orchestrator events → Gateway broadcast
    this.orchestrator.on('task:completed', (data: unknown) => {
      this.gateway.broadcast('task:completed', data as Record<string, unknown>);
    });

    this.orchestrator.on('task:failed', (data: unknown) => {
      this.gateway.broadcast('task:failed', data as Record<string, unknown>);
    });

    this.orchestrator.on('agent:spawned', (data: unknown) => {
      this.gateway.broadcast('agent:spawned', data as Record<string, unknown>);
    });
  }

  // ── Default Scheduled Jobs ──

  private registerDefaultJobs(): void {
    // Self-evaluation cycle
    this.addJob({
      name: 'Self-Evaluation Cycle',
      taskType: 'self_evaluation',
      priority: 'low',
      cronDescription: 'Every 24 hours',
      intervalMs: CONFIG.daemon.selfEvalIntervalMs,
      payload: {},
    });

    // EHR sync pulse
    this.addJob({
      name: 'EHR Sync Pulse',
      taskType: 'ehr_sync',
      priority: 'medium',
      cronDescription: 'Every 1 hour',
      intervalMs: CONFIG.daemon.cycleIntervalMs,
      payload: { scope: 'incremental' },
    });

    // Memory consolidation
    this.addJob({
      name: 'Memory Consolidation',
      taskType: 'custom',
      priority: 'low',
      cronDescription: 'Every 6 hours',
      intervalMs: 6 * 3600000,
      payload: { action: 'consolidate_memory' },
    });
  }

  addJob(config: Omit<ScheduledJob, 'id' | 'lastRun' | 'nextRun' | 'enabled'>): string {
    const id = uuid();
    const job: ScheduledJob = {
      id,
      ...config,
      lastRun: null,
      nextRun: new Date(Date.now() + config.intervalMs),
      enabled: true,
    };
    this.scheduledJobs.set(id, job);
    this.logger.info(`Scheduled job registered: ${config.name} (every ${config.intervalMs / 1000}s)`);
    return id;
  }

  // ── Task Queue ──

  async enqueueTask(task: Task): Promise<unknown> {
    return new Promise((resolve) => {
      this.taskQueue.push({ task, resolve });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.taskQueue.length === 0) return;
    this.processing = true;

    while (this.taskQueue.length > 0) {
      // Sort by priority
      this.taskQueue.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.task.priority] - priorityOrder[b.task.priority];
      });

      const { task, resolve } = this.taskQueue.shift()!;
      const startTime = Date.now();

      try {
        this.logger.info(`Processing task: ${task.title} [${task.type}/${task.priority}]`);
        this.gateway.broadcast('task:started', { id: task.id, title: task.title, type: task.type });

        const result = await this.orchestrator.executeTask(task);

        this.memory.logExecution({
          agentId: task.assignedAgent || 'orchestrator',
          taskId: task.id,
          action: `task:${task.type}`,
          input: { title: task.title, payload: task.payload },
          output: result,
          durationMs: Date.now() - startTime,
          success: true,
        });

        resolve(result);
      } catch (err) {
        this.logger.error(`Task failed: ${task.title}`, { error: String(err) });

        this.memory.logExecution({
          agentId: task.assignedAgent || 'orchestrator',
          taskId: task.id,
          action: `task:${task.type}`,
          input: { title: task.title },
          output: { error: String(err) },
          durationMs: Date.now() - startTime,
          success: false,
        });

        this.gateway.broadcast('task:failed', { id: task.id, error: String(err) });
        resolve({ success: false, error: String(err) });
      }
    }

    this.processing = false;
  }

  // ── Main Loop ──

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startedAt = new Date();

    this.logger.info('═══════════════════════════════════════════');
    this.logger.info('  DoctaRx Agent Swarm — DAEMON ONLINE');
    this.logger.info(`  Cycle interval: ${CONFIG.daemon.cycleIntervalMs / 1000}s`);
    this.logger.info(`  Self-eval interval: ${CONFIG.daemon.selfEvalIntervalMs / 1000}s`);
    this.logger.info('═══════════════════════════════════════════');

    // Start gateway
    await this.gateway.start();

    // Main heartbeat tick
    this.mainLoopTimer = setInterval(() => this.tick(), 10000); // every 10s

    // Start scheduled jobs
    for (const [id, job] of this.scheduledJobs) {
      if (job.enabled) {
        const timer = setInterval(() => this.runJob(id), job.intervalMs);
        this.jobTimers.set(id, timer);
      }
    }

    // Initial tick
    await this.tick();

    this.emit('daemon:started');
    this.gateway.broadcast('daemon:started', {
      startedAt: this.startedAt.toISOString(),
      jobs: Array.from(this.scheduledJobs.values()).map(j => j.name),
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.logger.info('Daemon shutting down...');

    // Clear timers
    if (this.mainLoopTimer) clearInterval(this.mainLoopTimer);
    if (this.selfEvalTimer) clearInterval(this.selfEvalTimer);
    for (const timer of this.jobTimers.values()) clearInterval(timer);
    this.jobTimers.clear();

    // Disconnect channels
    if (this.channelManager) {
      await this.channelManager.disconnectAll();
    }

    // Stop gateway
    await this.gateway.stop();

    // Close memory
    this.memory.close();

    this.logger.info('Daemon stopped');
    this.emit('daemon:stopped');
  }

  // ── Heartbeat Tick ──

  private async tick(): Promise<void> {
    this.tickCount++;
    this.emit('loop:tick', { tick: this.tickCount, timestamp: new Date() });

    // Check for due scheduled jobs
    const now = Date.now();
    for (const [id, job] of this.scheduledJobs) {
      if (job.enabled && job.nextRun.getTime() <= now) {
        this.runJob(id);
      }
    }

    // Broadcast heartbeat every 6 ticks (~60s)
    if (this.tickCount % 6 === 0) {
      this.gateway.broadcast('daemon:heartbeat', {
        tick: this.tickCount,
        uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
        queueLength: this.taskQueue.length,
        clients: this.gateway.getClientCount(),
        memoryStats: this.memory.getStats(),
      });
    }
  }

  // ── Run Scheduled Job ──

  private async runJob(jobId: string): Promise<void> {
    const job = this.scheduledJobs.get(jobId);
    if (!job || !job.enabled) return;

    this.logger.info(`Running scheduled job: ${job.name}`);
    job.lastRun = new Date();
    job.nextRun = new Date(Date.now() + job.intervalMs);

    // Handle special job types
    if (job.payload.action === 'consolidate_memory') {
      const pruned = await this.memory.consolidateMemory('orchestrator');
      this.logger.info(`Memory consolidation complete: ${pruned} entries pruned`);
      return;
    }

    if (job.taskType === 'self_evaluation') {
      await this.triggerSelfEvaluation();
      return;
    }

    // Self-healing jobs
    if (job.payload.action === 'health_check' && this.healingEngine) {
      const results = await this.healingEngine.runHealthCheck();
      const unhealthy = results.filter(r => r.status === 'unhealthy').length;
      if (unhealthy > 0) this.logger.warn(`Health check: ${unhealthy} unhealthy components`);
      return;
    }
    if (job.payload.action === 'circuit_breaker_eval' && this.healingEngine) {
      this.healingEngine.evaluateCircuitBreakers();
      return;
    }
    if (job.payload.action === 'dependency_audit' && this.healingEngine) {
      await this.healingEngine.auditDependencies();
      return;
    }

    // Introspection jobs
    if (job.payload.action === 'introspection' && this.consciousnessEngine) {
      const log = this.orchestrator.getExecutionLog(100);
      await this.consciousnessEngine.runIntrospectionCycle(log);
      return;
    }

    // Create and enqueue task
    const task = this.orchestrator.createTask(
      job.taskType,
      job.priority,
      job.name,
      `Scheduled job: ${job.cronDescription}`,
      job.payload
    );

    await this.enqueueTask(task);
  }

  // ── Self-Evaluation ──

  private async triggerSelfEvaluation(): Promise<void> {
    this.logger.info('┌─── Self-Evaluation Cycle ───────────────────');

    try {
      const evaluation = await this.orchestrator.runSelfEvaluation();

      if (evaluation) {
        this.memory.storeSelfEvaluation({
          id: evaluation.id,
          timestamp: evaluation.timestamp,
          periodStart: evaluation.period.start,
          periodEnd: evaluation.period.end,
          metrics: evaluation.metrics as unknown as Record<string, unknown>,
          analysis: evaluation.analysis,
          recommendations: evaluation.recommendations,
          routingChanges: evaluation.routingChanges as unknown as Array<Record<string, unknown>>,
        });

        this.gateway.broadcast('self-eval:complete', {
          id: evaluation.id,
          recommendations: evaluation.recommendations,
          routingChanges: evaluation.routingChanges.length,
        });

        this.logger.info(`  Analysis: ${evaluation.analysis.slice(0, 200)}...`);
        this.logger.info(`  Recommendations: ${evaluation.recommendations.length}`);
        this.logger.info(`  Routing changes: ${evaluation.routingChanges.length}`);
      }
    } catch (err) {
      this.logger.error('Self-evaluation failed', { error: String(err) });
    }

    this.logger.info('└─────────────────────────────────────────────');
  }

  // ── Command Handler ──

  private handleCommand(msg: Record<string, unknown>, callback: (result: unknown) => void): void {
    const channel = msg.channel as string;
    const payload = msg.payload as Record<string, unknown>;

    switch (channel) {
      case 'task:create':
        const task = this.orchestrator.createTask(
          payload.type as TaskType,
          (payload.priority as TaskPriority) || 'medium',
          payload.title as string,
          payload.description as string || '',
          payload.payload as Record<string, unknown> || {}
        );
        this.enqueueTask(task).then(result => callback(result));
        break;

      case 'job:list':
        callback(Array.from(this.scheduledJobs.values()));
        break;

      case 'job:toggle':
        const job = this.scheduledJobs.get(payload.jobId as string);
        if (job) {
          job.enabled = !job.enabled;
          callback({ id: job.id, name: job.name, enabled: job.enabled });
        } else {
          callback({ error: 'Job not found' });
        }
        break;

      case 'self-eval:run':
        this.triggerSelfEvaluation().then(() => callback({ status: 'complete' }));
        break;

      case 'memory:stats':
        callback(this.memory.getStats());
        break;

      case 'daemon:status':
        callback(this.getState());
        break;

      default:
        callback({ error: `Unknown command: ${channel}` });
    }
  }

  // ── State ──

  getState(): Record<string, unknown> {
    return {
      running: this.running,
      startedAt: this.startedAt?.toISOString(),
      uptime: this.startedAt ? Date.now() - this.startedAt.getTime() : 0,
      tickCount: this.tickCount,
      queueLength: this.taskQueue.length,
      processing: this.processing,
      scheduledJobs: Array.from(this.scheduledJobs.values()).map(j => ({
        id: j.id,
        name: j.name,
        enabled: j.enabled,
        lastRun: j.lastRun?.toISOString(),
        nextRun: j.nextRun.toISOString(),
      })),
      connectedClients: this.gateway.getClientCount(),
      orchestratorState: this.orchestrator.getState(),
      memoryStats: this.memory.getStats(),
    };
  }
}
