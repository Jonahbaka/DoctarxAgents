// ═══════════════════════════════════════════════════════════════
// Consciousness Engine (Oracle)
// Unified hyper self-awareness system
// ═══════════════════════════════════════════════════════════════

import { ConsciousnessMetrics, SystemEvent, LoggerHandle } from '../core/types.js';
import { IntrospectionEngine } from './introspection.js';
import { ConsciousnessMetricsCollector } from './metrics-collector.js';

export class ConsciousnessEngine {
  private introspection: IntrospectionEngine;
  public metricsCollector: ConsciousnessMetricsCollector;
  private logger: LoggerHandle;

  constructor(logger: LoggerHandle) {
    this.logger = logger;
    this.introspection = new IntrospectionEngine(logger);
    this.metricsCollector = new ConsciousnessMetricsCollector();
  }

  async runIntrospectionCycle(executionLog: SystemEvent[]): Promise<{
    metrics: ConsciousnessMetrics;
    biases: string[];
    selfModel: Record<string, unknown>;
    philosophicalReflection: string;
  }> {
    this.logger.info('┌─── Consciousness Introspection Cycle ──────');

    const metrics = this.metricsCollector.getMetrics(executionLog);
    this.logger.info(`  Confidence: ${(metrics.confidenceLevel * 100).toFixed(1)}%`);
    this.logger.info(`  Uncertainty: ${(metrics.uncertaintyQuantification * 100).toFixed(1)}%`);
    this.logger.info(`  Cognitive load: ${(metrics.cognitiveLoad * 100).toFixed(1)}%`);
    this.logger.info(`  Emotional tone: ${metrics.emotionalTone}`);

    const biases = await this.introspection.identifyCognitiveBiases(metrics, executionLog);
    if (biases.length > 0) {
      this.logger.warn(`  Biases detected: ${biases.length}`);
      biases.forEach(b => this.logger.warn(`    - ${b}`));
    }

    const selfModel = await this.introspection.generateSelfModel(metrics, biases);

    let philosophicalReflection = 'Introspection complete. No deep meta-reasoning triggered.';
    if (metrics.cognitiveLoad > 0.7 || biases.length > 1) {
      philosophicalReflection = await this.introspection.metaReason(
        'System operating under high cognitive load with detected biases',
        `Metrics: ${JSON.stringify(metrics)}\nBiases: ${biases.join('; ')}`
      );
    }

    this.logger.info('└─────────────────────────────────────────────');

    return { metrics, biases, selfModel, philosophicalReflection };
  }

  recordDecision(taskType: string, agentRole: string, success: boolean): void {
    this.metricsCollector.recordDecision(taskType, agentRole, success);
  }
}

export { IntrospectionEngine } from './introspection.js';
export { ConsciousnessMetricsCollector } from './metrics-collector.js';
