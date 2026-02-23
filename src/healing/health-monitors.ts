// ═══════════════════════════════════════════════════════════════
// Self-Healing :: Health Monitors
// Process, database, API, memory pressure diagnostics
// ═══════════════════════════════════════════════════════════════

import { HealthCheckResult } from '../core/types.js';
import type Database from 'better-sqlite3';

export async function checkProcessHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  const mem = process.memoryUsage();
  const heapPct = mem.heapUsed / mem.heapTotal;
  return {
    component: 'process',
    status: heapPct > 0.9 ? 'unhealthy' : heapPct > 0.75 ? 'degraded' : 'healthy',
    latencyMs: Date.now() - start,
    message: `Heap: ${(heapPct * 100).toFixed(1)}% (${(mem.heapUsed / 1048576).toFixed(1)}MB / ${(mem.heapTotal / 1048576).toFixed(1)}MB) RSS: ${(mem.rss / 1048576).toFixed(1)}MB`,
    timestamp: new Date(),
  };
}

export async function checkDatabaseHealth(db: Database.Database): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    db.prepare('SELECT 1').get();
    const latency = Date.now() - start;
    return {
      component: 'database',
      status: latency > 500 ? 'degraded' : 'healthy',
      latencyMs: latency,
      message: `SQLite responsive (${latency}ms)`,
      timestamp: new Date(),
    };
  } catch (err) {
    return {
      component: 'database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: `SQLite error: ${err}`,
      timestamp: new Date(),
    };
  }
}

export async function checkApiEndpointHealth(url: string): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    return {
      component: `api:${url}`,
      status: resp.ok ? (latency > 2000 ? 'degraded' : 'healthy') : 'unhealthy',
      latencyMs: latency,
      message: `HTTP ${resp.status} (${latency}ms)`,
      timestamp: new Date(),
    };
  } catch (err) {
    return {
      component: `api:${url}`,
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: `Unreachable: ${err}`,
      timestamp: new Date(),
    };
  }
}

export async function checkMemoryPressure(): Promise<HealthCheckResult> {
  const start = Date.now();
  const mem = process.memoryUsage();
  const rssMB = mem.rss / 1048576;
  const externalMB = mem.external / 1048576;
  // Warn if RSS exceeds 512MB
  const status = rssMB > 512 ? 'unhealthy' : rssMB > 384 ? 'degraded' : 'healthy';
  return {
    component: 'memory_pressure',
    status,
    latencyMs: Date.now() - start,
    message: `RSS: ${rssMB.toFixed(1)}MB External: ${externalMB.toFixed(1)}MB`,
    timestamp: new Date(),
  };
}

export async function checkEventLoopLag(): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    setImmediate(() => {
      const lag = Date.now() - start;
      resolve({
        component: 'event_loop',
        status: lag > 100 ? 'unhealthy' : lag > 50 ? 'degraded' : 'healthy',
        latencyMs: lag,
        message: `Event loop lag: ${lag}ms`,
        timestamp: new Date(),
      });
    });
  });
}
