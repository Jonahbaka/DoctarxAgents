// ═══════════════════════════════════════════════════════════════
// Consciousness :: Introspection Engine
// Meta-reasoning, cognitive bias detection, self-modeling
// ═══════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { ConsciousnessMetrics, SystemEvent, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';

export class IntrospectionEngine {
  private client: Anthropic;
  private logger: LoggerHandle;

  constructor(logger: LoggerHandle) {
    this.logger = logger;
    this.client = new Anthropic({ apiKey: CONFIG.anthropic.apiKey });
  }

  async analyzeDecisionPatterns(executionLog: SystemEvent[]): Promise<Record<string, number>> {
    const patterns: Record<string, number> = {};

    for (const event of executionLog) {
      const key = `${event.type}:${event.payload.agentRole || event.payload.taskType || 'unknown'}`;
      patterns[key] = (patterns[key] || 0) + 1;
    }

    return patterns;
  }

  async identifyCognitiveBiases(metrics: ConsciousnessMetrics, executionLog: SystemEvent[]): Promise<string[]> {
    const biases: string[] = [];

    // Recency bias: over-routing to the most recently successful agent
    const recentTasks = executionLog.filter(e => e.type === 'task:completed').slice(-20);
    const agentCounts: Record<string, number> = {};
    for (const t of recentTasks) {
      const agent = (t.payload.agentRole as string) || 'unknown';
      agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    }
    const maxAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
    if (maxAgent && maxAgent[1] > recentTasks.length * 0.6) {
      biases.push(`Recency bias: ${maxAgent[1]}/${recentTasks.length} recent tasks routed to ${maxAgent[0]}`);
    }

    // Confirmation bias: ignoring failures
    const failRate = executionLog.filter(e => e.type === 'task:failed').length / Math.max(executionLog.length, 1);
    if (failRate > 0.3) {
      biases.push(`High failure rate (${(failRate * 100).toFixed(1)}%) may indicate confirmation bias in task acceptance`);
    }

    // Anchoring: always using same temperature/approach
    if (metrics.reasoningDepth < 2) {
      biases.push('Shallow reasoning depth may indicate anchoring to first solution');
    }

    return biases;
  }

  async measureConfidence(taskSuccessRate: number, recentErrors: number): Promise<number> {
    // Confidence calibration: 0-1
    let confidence = taskSuccessRate;
    confidence -= recentErrors * 0.05; // penalize recent errors
    return Math.max(0, Math.min(1, confidence));
  }

  async generateSelfModel(metrics: ConsciousnessMetrics, biases: string[]): Promise<Record<string, unknown>> {
    return {
      strengths: this.inferStrengths(metrics),
      weaknesses: biases,
      cognitiveLoad: metrics.cognitiveLoad,
      attentionProfile: metrics.attentionAllocation,
      confidenceCalibration: metrics.confidenceLevel,
      emotionalState: metrics.emotionalTone,
      recommendation: metrics.cognitiveLoad > 0.8
        ? 'Reduce task complexity or spawn more sub-agents'
        : 'Operating within normal parameters',
    };
  }

  private inferStrengths(metrics: ConsciousnessMetrics): string[] {
    const strengths: string[] = [];
    if (metrics.confidenceLevel > 0.8) strengths.push('High confidence calibration');
    if (metrics.reasoningDepth > 3) strengths.push('Deep multi-step reasoning');
    if (metrics.cognitiveLoad < 0.5) strengths.push('Efficient resource utilization');
    if (Object.keys(metrics.attentionAllocation).length > 3) strengths.push('Broad domain coverage');
    return strengths.length > 0 ? strengths : ['Baseline operational capability'];
  }

  async metaReason(decision: string, context: string): Promise<string> {
    this.logger.info('Meta-reasoning cycle...');

    const response = await this.client.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: 2048,
      temperature: 0.7,
      system: `You are performing meta-cognition — thinking about your own thinking.
Analyze the decision described and explain:
1. Why this decision was made (root cause analysis)
2. What assumptions were implicit
3. What alternative decisions were possible
4. Whether the decision reflects any cognitive biases
5. How you would improve the decision-making process
Be philosophical yet precise.`,
      messages: [{ role: 'user', content: `Decision: ${decision}\n\nContext: ${context}\n\nPerform deep meta-reasoning.` }],
    });

    return response.content.find(b => b.type === 'text')?.text || 'Meta-reasoning inconclusive.';
  }
}
