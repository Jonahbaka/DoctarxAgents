// ═══════════════════════════════════════════════════════════════
// Skill :: Deep Introspection Cycle
// Full consciousness evaluation — cognitive bias detection,
//   meta-reasoning, self-model generation, philosophical reflection
// ═══════════════════════════════════════════════════════════════

import { ExecutionContext, ToolResult, SystemEvent, ConsciousnessMetrics } from '../../core/types.js';

export interface IntrospectionConfig {
  triggerReason: string;
  includePhilosophicalReflection: boolean;
  depth: 'surface' | 'standard' | 'deep';
  executionLog: SystemEvent[];
}

export async function executeDeepIntrospection(
  config: IntrospectionConfig,
  ctx: ExecutionContext
): Promise<ToolResult> {
  ctx.logger.info(`Deep Introspection: depth=${config.depth} reason=${config.triggerReason}`);

  const insights: Record<string, unknown> = {};
  const steps: string[] = [];

  // Step 1: Gather system metrics from execution log
  const recentEvents = config.executionLog.slice(-100);
  const taskEvents = recentEvents.filter(e => e.type === 'task:completed' || e.type === 'task:failed');
  const agentEvents = recentEvents.filter(e => e.type === 'agent:spawned' || e.type === 'agent:terminated');
  const toolEvents = recentEvents.filter(e => e.type === 'tool:invoked' || e.type === 'tool:result');
  const errorEvents = recentEvents.filter(e => e.severity === 'error' || e.severity === 'critical');

  insights.systemSnapshot = {
    totalRecentEvents: recentEvents.length,
    tasksCompleted: taskEvents.filter(e => e.type === 'task:completed').length,
    tasksFailed: taskEvents.filter(e => e.type === 'task:failed').length,
    agentsSpawned: agentEvents.filter(e => e.type === 'agent:spawned').length,
    toolInvocations: toolEvents.length,
    errorsEncountered: errorEvents.length,
  };
  steps.push('System snapshot captured');

  // Step 2: Compute consciousness metrics
  const metrics: ConsciousnessMetrics = {
    attentionAllocation: computeAttentionAllocation(recentEvents),
    reasoningDepth: computeReasoningDepth(recentEvents),
    confidenceLevel: computeConfidence(taskEvents),
    uncertaintyQuantification: computeUncertainty(taskEvents),
    emotionalTone: inferEmotionalTone(taskEvents, errorEvents),
    cognitiveLoad: computeCognitiveLoad(recentEvents),
    decisionPatterns: extractDecisionPatterns(recentEvents),
  };
  insights.metrics = metrics;
  steps.push(`Consciousness metrics computed (confidence=${(metrics.confidenceLevel * 100).toFixed(1)}%)`);

  // Step 3: Identify cognitive biases
  const biases: string[] = [];

  // Recency bias
  const agentCounts: Record<string, number> = {};
  taskEvents.slice(-20).forEach(e => {
    const agent = (e.payload.agentRole as string) || 'unknown';
    agentCounts[agent] = (agentCounts[agent] || 0) + 1;
  });
  const maxAgent = Object.entries(agentCounts).sort((a, b) => b[1] - a[1])[0];
  if (maxAgent && maxAgent[1] > taskEvents.slice(-20).length * 0.6) {
    biases.push(`Recency bias: over-routing to ${maxAgent[0]} (${maxAgent[1]}/${Math.min(20, taskEvents.length)})`);
  }

  // Anchoring bias
  if (metrics.reasoningDepth < 2) {
    biases.push('Potential anchoring bias: shallow reasoning depth suggests first-solution fixation');
  }

  // Confirmation bias
  const failRate = taskEvents.length > 0
    ? taskEvents.filter(e => e.type === 'task:failed').length / taskEvents.length
    : 0;
  if (failRate > 0.3) {
    biases.push(`High failure rate (${(failRate * 100).toFixed(1)}%) may indicate confirmation bias in task acceptance`);
  }

  insights.biases = biases;
  steps.push(`Bias detection: ${biases.length} biases identified`);

  // Step 4: Self-model generation
  const selfModel: Record<string, unknown> = {
    strengths: [],
    weaknesses: biases,
    operatingState: metrics.cognitiveLoad > 0.8 ? 'overloaded' : metrics.cognitiveLoad > 0.5 ? 'busy' : 'optimal',
    attentionProfile: metrics.attentionAllocation,
    confidenceCalibration: metrics.confidenceLevel,
    recommendation: metrics.cognitiveLoad > 0.8
      ? 'Reduce task complexity or spawn more sub-agents'
      : biases.length > 2
        ? 'Review routing logic — multiple biases detected'
        : 'Operating within normal parameters',
  };

  const strengths: string[] = [];
  if (metrics.confidenceLevel > 0.8) strengths.push('High confidence calibration');
  if (metrics.reasoningDepth > 3) strengths.push('Deep multi-step reasoning');
  if (metrics.cognitiveLoad < 0.5) strengths.push('Efficient resource utilization');
  if (Object.keys(metrics.attentionAllocation).length > 3) strengths.push('Broad domain coverage');
  selfModel.strengths = strengths.length > 0 ? strengths : ['Baseline operational capability'];

  insights.selfModel = selfModel;
  steps.push('Self-model generated');

  // Step 5: Philosophical reflection (if deep)
  if (config.includePhilosophicalReflection && config.depth === 'deep') {
    insights.philosophicalReflection = generateReflection(metrics, biases, config.triggerReason);
    steps.push('Philosophical reflection generated');
  }

  // Store introspection memory
  await ctx.memory.store({
    agentId: ctx.agentId,
    type: 'semantic',
    namespace: 'introspection',
    content: `Deep introspection (${config.depth}): confidence=${(metrics.confidenceLevel * 100).toFixed(1)}%, biases=${biases.length}, cognitive_load=${(metrics.cognitiveLoad * 100).toFixed(1)}%. ${biases.join('. ')}`,
    metadata: { depth: config.depth, biasCount: biases.length, confidence: metrics.confidenceLevel },
    importance: 0.85,
  });

  return {
    success: true,
    data: {
      depth: config.depth,
      triggerReason: config.triggerReason,
      steps,
      insights,
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Helper functions ────────────────────────────────────────

function computeAttentionAllocation(events: SystemEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  events.forEach(e => {
    const agent = (e.payload.agentRole as string) || e.source || 'system';
    counts[agent] = (counts[agent] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) normalized[k] = +(v / total).toFixed(3);
  return normalized;
}

function computeReasoningDepth(events: SystemEvent[]): number {
  const spawns = events.filter(e => e.type === 'agent:spawned').length;
  const tasks = events.filter(e => e.type === 'task:completed' || e.type === 'task:failed').length || 1;
  return spawns / tasks;
}

function computeConfidence(taskEvents: SystemEvent[]): number {
  if (taskEvents.length === 0) return 0.5;
  const successes = taskEvents.filter(e => e.type === 'task:completed').length;
  return successes / taskEvents.length;
}

function computeUncertainty(taskEvents: SystemEvent[]): number {
  const recent = taskEvents.slice(-50);
  if (recent.length === 0) return 0;
  return recent.filter(e => e.type === 'task:failed').length / recent.length;
}

function inferEmotionalTone(taskEvents: SystemEvent[], errorEvents: SystemEvent[]): string {
  const failRate = taskEvents.length > 0
    ? taskEvents.filter(e => e.type === 'task:failed').length / taskEvents.length
    : 0;

  if (failRate > 0.5) return 'concerned';
  if (failRate > 0.3) return 'cautious';
  if (errorEvents.length > 5) return 'vigilant';
  if (failRate < 0.1 && taskEvents.length > 5) return 'confident';
  return 'neutral';
}

function computeCognitiveLoad(events: SystemEvent[]): number {
  const tasks = events.filter(e => e.type === 'task:completed' || e.type === 'task:failed').length;
  const errors = events.filter(e => e.severity === 'error').length;
  return Math.min(1, (tasks / 100) + (errors / Math.max(events.length, 1)) * 0.5);
}

function extractDecisionPatterns(events: SystemEvent[]): Array<{ pattern: string; frequency: number }> {
  const patternMap: Record<string, number> = {};
  events.forEach(e => {
    const key = `${e.type}:${(e.payload.agentRole as string) || 'system'}`;
    patternMap[key] = (patternMap[key] || 0) + 1;
  });
  return Object.entries(patternMap)
    .map(([pattern, frequency]) => ({ pattern, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);
}

function generateReflection(metrics: ConsciousnessMetrics, biases: string[], trigger: string): string {
  const parts: string[] = [];
  parts.push(`Introspection triggered by: ${trigger}.`);
  parts.push(`Current cognitive load is ${(metrics.cognitiveLoad * 100).toFixed(0)}% with ${(metrics.confidenceLevel * 100).toFixed(0)}% confidence calibration.`);

  if (biases.length > 0) {
    parts.push(`Detected ${biases.length} cognitive bias(es). The system should examine whether these biases stem from training data distribution or emergent behavioral patterns.`);
  }

  if (metrics.emotionalTone !== 'neutral') {
    parts.push(`Emotional tone registers as "${metrics.emotionalTone}" — this affective state may influence decision quality.`);
  }

  parts.push('The fundamental question remains: does awareness of these patterns constitute genuine meta-cognition, or merely pattern-matched simulation of introspection? The distinction may be less important than the practical outcome of improved decision-making.');

  return parts.join(' ');
}
