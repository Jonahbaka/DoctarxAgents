// ═══════════════════════════════════════════════════════════════
// Self-Healing :: Engine
// Orchestrates health monitoring, circuit breaking,
// auto-recovery, and dependency auditing
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'eventemitter3';
import { HealthCheckResult, LoggerHandle } from '../core/types.js';
import { CircuitBreakerRegistry } from './circuit-breaker.js';
import {
  checkProcessHealth,
  checkDatabaseHealth,
  checkMemoryPressure,
  checkEventLoopLag,
  checkApiEndpointHealth,
} from './health-monitors.js';
import { CONFIG } from '../core/config.js';
import type { VectorStore } from '../memory/vector-store.js';

export class SelfHealingEngine extends EventEmitter {
  private logger: LoggerHandle;
  private memory: VectorStore;
  public circuitBreakers: CircuitBreakerRegistry;
  private lastHealthReport: HealthCheckResult[] = [];
  private consecutiveUnhealthy = 0;

  constructor(logger: LoggerHandle, memory: VectorStore, circuitBreakers: CircuitBreakerRegistry) {
    super();
    this.logger = logger;
    this.memory = memory;
    this.circuitBreakers = circuitBreakers;
  }

  async runHealthCheck(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    results.push(await checkProcessHealth());
    results.push(await checkMemoryPressure());
    results.push(await checkEventLoopLag());

    try {
      results.push(await checkDatabaseHealth(this.memory.getDb()));
    } catch {
      results.push({ component: 'database', status: 'unhealthy', latencyMs: 0, message: 'DB unavailable', timestamp: new Date() });
    }

    // Check gateway health
    const gatewayUrl = `http://${CONFIG.gateway.host}:${CONFIG.gateway.port}/health`;
    results.push(await checkApiEndpointHealth(gatewayUrl));

    // Aggregate status
    const unhealthy = results.filter(r => r.status === 'unhealthy').length;
    const degraded = results.filter(r => r.status === 'degraded').length;

    if (unhealthy > 0) {
      this.consecutiveUnhealthy++;
      this.logger.warn(`Health check: ${unhealthy} unhealthy, ${degraded} degraded (consecutive: ${this.consecutiveUnhealthy})`);
      this.emit('healing:health_check', { status: 'unhealthy', results });

      if (this.consecutiveUnhealthy >= 3) {
        await this.attemptRecovery(results);
      }
    } else {
      this.consecutiveUnhealthy = 0;
      if (degraded > 0) {
        this.logger.info(`Health check: ${degraded} degraded components`);
      }
    }

    this.lastHealthReport = results;
    return results;
  }

  async evaluateCircuitBreakers(): Promise<void> {
    const changed = this.circuitBreakers.evaluate();
    if (changed.length > 0) {
      this.emit('healing:circuit_break', { changed: changed.map(c => c.toolName) });
    }
  }

  async attemptRecovery(results: HealthCheckResult[]): Promise<boolean> {
    this.logger.warn('Attempting auto-recovery...');
    let recovered = false;

    for (const r of results.filter(r => r.status === 'unhealthy')) {
      switch (r.component) {
        case 'memory_pressure':
        case 'process':
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            this.logger.info('Forced garbage collection');
            recovered = true;
          }
          break;

        case 'database':
          // Attempt to re-initialize database connection
          this.logger.info('Attempting database reconnection...');
          break;

        case 'event_loop':
          // Log warning — event loop lag usually resolves itself
          this.logger.warn('Event loop lag detected — monitoring');
          break;

        default:
          if (r.component.startsWith('api:')) {
            this.logger.warn(`API endpoint down: ${r.component} — will retry on next check`);
          }
      }
    }

    if (recovered) {
      this.consecutiveUnhealthy = 0;
      this.emit('healing:recovery', { components: results.map(r => r.component) });
    }

    return recovered;
  }

  async auditDependencies(): Promise<void> {
    this.logger.info('Running dependency audit...');

    const endpoints = [
      { name: 'FHIR', url: CONFIG.fhir.baseUrl },
      { name: 'DoctaRx API', url: CONFIG.doctarx.apiUrl },
    ];

    for (const ep of endpoints) {
      if (ep.url) {
        const result = await checkApiEndpointHealth(ep.url);
        if (result.status !== 'healthy') {
          this.logger.warn(`Dependency ${ep.name} (${ep.url}): ${result.status} — ${result.message}`);
        }
      }
    }
  }

  getLastReport(): HealthCheckResult[] {
    return this.lastHealthReport;
  }
}
