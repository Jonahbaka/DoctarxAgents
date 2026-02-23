// ═══════════════════════════════════════════════════════════════
// Consciousness :: Metrics Collector
// Tracks attention, reasoning depth, uncertainty, cognitive load
// ═══════════════════════════════════════════════════════════════

import { ConsciousnessMetrics, SystemEvent } from '../core/types.js';

export class ConsciousnessMetricsCollector {
  private attentionMap: Record<string, number> = {};
  private decisionLog: Array<{ taskType: string; agentRole: string; success: boolean; timestamp: Date }> = [];
  private totalTasks = 0;
  private successfulTasks = 0;

  recordDecision(taskType: string, agentRole: string, success: boolean): void {
    this.decisionLog.push({ taskType, agentRole, success, timestamp: new Date() });
    if (this.decisionLog.length > 1000) this.decisionLog = this.decisionLog.slice(-500);

    this.attentionMap[agentRole] = (this.attentionMap[agentRole] || 0) + 1;
    this.totalTasks++;
    if (success) this.successfulTasks++;
  }

  getMetrics(executionLog: SystemEvent[] = []): ConsciousnessMetrics {
    // Attention allocation (normalized)
    const totalAttention = Object.values(this.attentionMap).reduce((a, b) => a + b, 0) || 1;
    const normalizedAttention: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.attentionMap)) {
      normalizedAttention[k] = +(v / totalAttention).toFixed(3);
    }

    // Reasoning depth: average sub-agent spawns per task
    const spawns = executionLog.filter(e => e.type === 'agent:spawned').length;
    const tasks = executionLog.filter(e => e.type === 'task:completed' || e.type === 'task:failed').length || 1;
    const reasoningDepth = spawns / tasks;

    // Confidence level
    const confidence = this.totalTasks > 0 ? this.successfulTasks / this.totalTasks : 0.5;

    // Uncertainty: failure rate in last 50 decisions
    const recent = this.decisionLog.slice(-50);
    const recentFails = recent.filter(d => !d.success).length;
    const uncertainty = recent.length > 0 ? recentFails / recent.length : 0;

    // Cognitive load: based on task throughput and error rate
    const cognitiveLoad = Math.min(1, (tasks / 100) + (uncertainty * 0.5));

    // Decision patterns
    const patternMap: Record<string, number> = {};
    for (const d of this.decisionLog) {
      const key = `${d.taskType}->${d.agentRole}`;
      patternMap[key] = (patternMap[key] || 0) + 1;
    }
    const decisionPatterns = Object.entries(patternMap)
      .map(([pattern, frequency]) => ({ pattern, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    // Emotional tone inference
    let emotionalTone = 'neutral';
    if (uncertainty > 0.3) emotionalTone = 'cautious';
    if (uncertainty > 0.5) emotionalTone = 'concerned';
    if (confidence > 0.9 && uncertainty < 0.1) emotionalTone = 'confident';

    return {
      attentionAllocation: normalizedAttention,
      reasoningDepth,
      confidenceLevel: confidence,
      uncertaintyQuantification: uncertainty,
      emotionalTone,
      cognitiveLoad,
      decisionPatterns,
    };
  }

  reset(): void {
    this.attentionMap = {};
    this.decisionLog = [];
    this.totalTasks = 0;
    this.successfulTasks = 0;
  }
}
