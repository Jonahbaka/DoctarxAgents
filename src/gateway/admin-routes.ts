// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Admin Portal API
// 20 REST routes + WebSocket admin feed for full swarm visibility
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import type { LoggerHandle } from '../core/types.js';
import type { CONFIG } from '../core/config.js';

// ── Dependency injection interface ──

export interface AdminDependencies {
  orchestrator: {
    getState(): Record<string, unknown>;
    getAgents(): unknown[];
    getTasks(): unknown[];
    getExecutionLog(limit?: number): unknown[];
    getSelfEvaluations(): unknown[];
  };
  memory: {
    getStats(): Record<string, unknown>;
    search?(query: string, type?: string, limit?: number): Promise<unknown[]>;
  };
  graphStore: {
    getStats(): Record<string, unknown>;
  };
  auditTrail: {
    getRecent(limit: number): unknown[];
    getByActor(actor: string, limit: number): unknown[];
    getByDateRange(start: Date, end: Date, limit: number): unknown[];
    verifyChain(): { valid: boolean; brokenAt?: number; totalEntries: number };
    getCount(): number;
  };
  healingEngine: {
    runHealthCheck(): Promise<unknown[]>;
    getLastResults?(): unknown[];
  };
  circuitBreakers: {
    getState(): unknown[];
    reset(toolName: string): void;
  };
  consciousnessEngine: {
    getLatestMetrics?(): unknown;
    runIntrospection?(): Promise<unknown>;
  };
  channelManager: {
    getStatus(): Array<{ name: string; type: string; connected: boolean }>;
    getConnectedCount(): number;
  };
  daemon: {
    getJobs?(): unknown[];
    toggleJob?(jobId: string): boolean;
    runJob?(jobId: string): Promise<void>;
  };
  tokenForge: {
    getStats?(): Record<string, unknown>;
    destroy(): void;
  };
  a2a: {
    getRegisteredAgents(): string[];
  };
  autonomy: {
    getPolicies(): unknown[];
  };
  config: typeof CONFIG;
  logger: LoggerHandle;
}

// ── Factory ──

export function createAdminRoutes(deps: AdminDependencies): Router {
  const router = Router();
  const { logger } = deps;

  // ─── 1. GET /admin/dashboard — Full dashboard state ───────
  router.get('/admin/dashboard', (_req: Request, res: Response) => {
    try {
      const state = deps.orchestrator.getState();
      const agents = deps.orchestrator.getAgents() as Array<Record<string, unknown>>;
      const tasks = deps.orchestrator.getTasks() as Array<Record<string, unknown>>;
      const memStats = deps.memory.getStats();
      const graphStats = deps.graphStore.getStats();
      const channelStatus = deps.channelManager.getStatus();
      const auditCount = deps.auditTrail.getCount();
      const a2aAgents = deps.a2a.getRegisteredAgents();
      const policies = deps.autonomy.getPolicies();

      res.json({
        system: {
          version: '6.0.0',
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          pid: process.pid,
          nodeVersion: process.version,
        },
        orchestrator: state,
        agents: agents.map(a => ({
          ...a,
          status: a.status || 'idle',
        })),
        taskQueue: {
          total: tasks.length,
          pending: tasks.filter(t => !t.startedAt).length,
          inProgress: tasks.filter(t => t.startedAt && !t.completedAt).length,
          completed: tasks.filter(t => t.completedAt && (t.result as Record<string, unknown>)?.success).length,
          failed: tasks.filter(t => t.completedAt && !(t.result as Record<string, unknown>)?.success).length,
        },
        channels: channelStatus,
        memory: memStats,
        graph: graphStats,
        audit: { totalEntries: auditCount },
        a2a: { registeredAgents: a2aAgents.length, agents: a2aAgents },
        governance: { policyCount: policies.length },
      });
    } catch (err) {
      logger.error(`Admin dashboard error: ${err}`);
      res.status(500).json({ error: `Dashboard error: ${err}` });
    }
  });

  // ─── 2. GET /admin/agents — All agents ────────────────────
  router.get('/admin/agents', (_req: Request, res: Response) => {
    try {
      const agents = deps.orchestrator.getAgents() as Array<Record<string, unknown>>;
      res.json({ agents, count: agents.length });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 3. GET /admin/agents/:role — Single agent detail ─────
  router.get('/admin/agents/:role', (req: Request, res: Response) => {
    try {
      const agents = deps.orchestrator.getAgents() as Array<Record<string, unknown>>;
      const agent = agents.find(a =>
        (a.identity as Record<string, unknown>)?.role === req.params.role
      );
      if (!agent) {
        res.status(404).json({ error: `Agent not found: ${req.params.role}` });
        return;
      }

      // Get recent tasks for this agent
      const log = deps.orchestrator.getExecutionLog(100) as Array<Record<string, unknown>>;
      const agentEvents = log.filter(e => e.source === req.params.role);

      res.json({ agent, recentEvents: agentEvents.slice(-20) });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 4. GET /admin/tasks — Task queue with filters ────────
  router.get('/admin/tasks', (req: Request, res: Response) => {
    try {
      let tasks = deps.orchestrator.getTasks() as Array<Record<string, unknown>>;
      const { status, priority, type, limit } = req.query;

      if (status === 'pending') tasks = tasks.filter(t => !t.startedAt);
      else if (status === 'in_progress') tasks = tasks.filter(t => t.startedAt && !t.completedAt);
      else if (status === 'completed') tasks = tasks.filter(t => t.completedAt);

      if (priority) tasks = tasks.filter(t => t.priority === priority);
      if (type) tasks = tasks.filter(t => t.type === type);

      const max = parseInt(String(limit) || '50');
      res.json({ tasks: tasks.slice(0, max), total: tasks.length });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 5. GET /admin/tasks/:id — Single task detail ─────────
  router.get('/admin/tasks/:id', (req: Request, res: Response) => {
    try {
      const tasks = deps.orchestrator.getTasks() as Array<Record<string, unknown>>;
      const task = tasks.find(t => t.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: `Task not found: ${req.params.id}` });
        return;
      }

      // Get execution trace for this task
      const log = deps.orchestrator.getExecutionLog(500) as Array<Record<string, unknown>>;
      const trace = log.filter(e =>
        (e.payload as Record<string, unknown>)?.taskId === req.params.id
      );

      res.json({ task, executionTrace: trace });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 6. POST /admin/tasks/:id/cancel — Cancel a task ──────
  router.post('/admin/tasks/:id/cancel', (req: Request, res: Response) => {
    try {
      const tasks = deps.orchestrator.getTasks() as Array<Record<string, unknown>>;
      const task = tasks.find(t => t.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: `Task not found: ${req.params.id}` });
        return;
      }
      if (task.completedAt) {
        res.status(400).json({ error: 'Task already completed' });
        return;
      }
      // Mark as cancelled
      task.completedAt = new Date();
      task.result = { success: false, output: null, tokensUsed: 0, executionTimeMs: 0, subTasksSpawned: [], errors: ['Cancelled by admin'] };
      logger.info(`[Admin] Task cancelled: ${req.params.id}`);
      res.json({ status: 'cancelled', taskId: req.params.id });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 7. POST /admin/tasks/:id/reprioritize ────────────────
  router.post('/admin/tasks/:id/reprioritize', (req: Request, res: Response) => {
    try {
      const tasks = deps.orchestrator.getTasks() as Array<Record<string, unknown>>;
      const task = tasks.find(t => t.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: `Task not found: ${req.params.id}` });
        return;
      }
      const { priority } = req.body as { priority?: string };
      if (!priority || !['critical', 'high', 'medium', 'low'].includes(priority)) {
        res.status(400).json({ error: 'Invalid priority. Must be: critical, high, medium, low' });
        return;
      }
      task.priority = priority;
      logger.info(`[Admin] Task ${req.params.id} reprioritized to ${priority}`);
      res.json({ status: 'reprioritized', taskId: req.params.id, priority });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 8. GET /admin/audit — Paginated audit trail ──────────
  router.get('/admin/audit', (req: Request, res: Response) => {
    try {
      const { actor, action, from, to, limit } = req.query;
      const max = parseInt(String(limit) || '50');

      if (actor) {
        const entries = deps.auditTrail.getByActor(String(actor), max);
        res.json({ entries, count: entries.length });
        return;
      }

      if (from && to) {
        const entries = deps.auditTrail.getByDateRange(new Date(String(from)), new Date(String(to)), max);
        res.json({ entries, count: entries.length });
        return;
      }

      const entries = deps.auditTrail.getRecent(max);
      res.json({ entries, count: entries.length, total: deps.auditTrail.getCount() });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 9. GET /admin/audit/verify — Verify hash chain ───────
  router.get('/admin/audit/verify', (_req: Request, res: Response) => {
    try {
      const result = deps.auditTrail.verifyChain();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 10. GET /admin/health — Full health report ───────────
  router.get('/admin/health', async (_req: Request, res: Response) => {
    try {
      const results = await deps.healingEngine.runHealthCheck();
      const circuitBreakers = deps.circuitBreakers.getState();

      res.json({
        checks: results,
        circuitBreakers,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 11. GET /admin/health/circuit-breakers ────────────────
  router.get('/admin/health/circuit-breakers', (_req: Request, res: Response) => {
    try {
      const states = deps.circuitBreakers.getState();
      res.json({ circuitBreakers: states });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 12. POST /admin/health/circuit-breakers/:name/reset ──
  router.post('/admin/health/circuit-breakers/:name/reset', (req: Request, res: Response) => {
    try {
      const name = String(req.params.name);
      deps.circuitBreakers.reset(name);
      logger.info(`[Admin] Circuit breaker reset: ${name}`);
      res.json({ status: 'reset', toolName: name });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 13. GET /admin/consciousness — Latest metrics ────────
  router.get('/admin/consciousness', (_req: Request, res: Response) => {
    try {
      const metrics = deps.consciousnessEngine.getLatestMetrics?.() ?? {
        message: 'No introspection data yet — runs hourly',
      };
      res.json({ consciousness: metrics });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 14. GET /admin/channels — Channel status ─────────────
  router.get('/admin/channels', (_req: Request, res: Response) => {
    try {
      const status = deps.channelManager.getStatus();
      res.json({
        channels: status,
        connectedCount: deps.channelManager.getConnectedCount(),
      });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 15. GET /admin/jobs — Scheduled jobs ─────────────────
  router.get('/admin/jobs', (_req: Request, res: Response) => {
    try {
      const jobs = deps.daemon.getJobs?.() ?? [];
      res.json({ jobs });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 16. POST /admin/jobs/:id/toggle — Toggle a job ───────
  router.post('/admin/jobs/:id/toggle', (req: Request, res: Response) => {
    try {
      const jobId = String(req.params.id);
      const result = deps.daemon.toggleJob?.(jobId);
      if (result === undefined) {
        res.status(404).json({ error: `Job not found or toggle not supported: ${jobId}` });
        return;
      }
      logger.info(`[Admin] Job toggled: ${jobId} → ${result ? 'enabled' : 'disabled'}`);
      res.json({ jobId, enabled: result });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 17. POST /admin/jobs/:id/run — Run job immediately ───
  router.post('/admin/jobs/:id/run', async (req: Request, res: Response) => {
    try {
      if (!deps.daemon.runJob) {
        res.status(501).json({ error: 'Run job not supported' });
        return;
      }
      const runJobId = String(req.params.id);
      await deps.daemon.runJob(runJobId);
      logger.info(`[Admin] Job run manually: ${runJobId}`);
      res.json({ jobId: runJobId, status: 'executed' });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 18. GET /admin/config — System config (masked) ───────
  router.get('/admin/config', (_req: Request, res: Response) => {
    try {
      const maskSecret = (val: string): string => {
        if (!val || val.length < 4) return '***';
        return val.slice(0, 4) + '***' + val.slice(-2);
      };

      // Deep clone and mask secrets
      const safeConfig: Record<string, unknown> = {};
      const raw = deps.config as Record<string, unknown>;

      for (const [section, value] of Object.entries(raw)) {
        if (typeof value === 'object' && value !== null) {
          const safeSection: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
            const lk = key.toLowerCase();
            if (lk.includes('key') || lk.includes('secret') || lk.includes('token') || lk.includes('pass')) {
              safeSection[key] = maskSecret(String(val || ''));
            } else {
              safeSection[key] = val;
            }
          }
          safeConfig[section] = safeSection;
        } else {
          safeConfig[section] = value;
        }
      }

      res.json({ config: safeConfig });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 19. GET /admin/tools/analytics — Tool stats ──────────
  router.get('/admin/tools/analytics', (_req: Request, res: Response) => {
    try {
      const log = deps.orchestrator.getExecutionLog(1000) as Array<Record<string, unknown>>;

      // Aggregate tool invocations
      const toolStats = new Map<string, { invocations: number; successes: number; failures: number; totalMs: number }>();

      for (const event of log) {
        if (event.type === 'tool:result') {
          const payload = event.payload as Record<string, unknown>;
          const toolName = String(payload.toolName || 'unknown');
          const success = payload.success === true;
          const durationMs = (payload.durationMs as number) || 0;

          const existing = toolStats.get(toolName) || { invocations: 0, successes: 0, failures: 0, totalMs: 0 };
          existing.invocations++;
          if (success) existing.successes++;
          else existing.failures++;
          existing.totalMs += durationMs;
          toolStats.set(toolName, existing);
        }
      }

      const analytics = Array.from(toolStats.entries()).map(([name, stats]) => ({
        toolName: name,
        invocations: stats.invocations,
        successRate: stats.invocations > 0 ? (stats.successes / stats.invocations * 100).toFixed(1) + '%' : 'N/A',
        avgLatencyMs: stats.invocations > 0 ? Math.round(stats.totalMs / stats.invocations) : 0,
        failures: stats.failures,
      }));

      analytics.sort((a, b) => b.invocations - a.invocations);

      res.json({ tools: analytics, totalToolInvocations: log.filter(e => (e as Record<string, unknown>).type === 'tool:result').length });
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  // ─── 20. GET /admin/memory/search — Memory search ─────────
  router.get('/admin/memory/search', async (req: Request, res: Response) => {
    try {
      const { query, type, limit } = req.query;
      if (!query) {
        const stats = deps.memory.getStats();
        res.json({ stats, message: 'Provide ?query= to search memory' });
        return;
      }

      if (deps.memory.search) {
        const results = await deps.memory.search(
          String(query),
          type ? String(type) : undefined,
          parseInt(String(limit) || '20')
        );
        res.json({ results, count: results.length });
      } else {
        res.json({ stats: deps.memory.getStats(), message: 'Memory search not available — use stats view' });
      }
    } catch (err) {
      res.status(500).json({ error: `${err}` });
    }
  });

  logger.info('[Admin] 20 admin API routes registered under /admin/*');
  return router;
}
