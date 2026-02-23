// ═══════════════════════════════════════════════════════════════
// Agent::Quantitative (Archimedes)
// Vortex math, calculus, physics, economics, statistics
// ═══════════════════════════════════════════════════════════════

import { ToolDefinition, ToolResult, ExecutionContext } from '../../core/types.js';
import { z } from 'zod';

// ── Math Solver ──

const MathInput = z.object({
  expression: z.string(),
  domain: z.enum(['algebra', 'calculus', 'linear_algebra', 'number_theory', 'symbolic']).default('algebra'),
  variables: z.record(z.string(), z.number()).optional(),
});

export const mathSolverTool: ToolDefinition = {
  name: 'math_solver',
  description: 'Solve mathematical expressions — algebra, calculus, linear algebra, number theory, symbolic computation. Delegates complex derivations to Claude reasoning.',
  category: 'computation',
  inputSchema: MathInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = MathInput.parse(input);
    ctx.logger.info(`Math solver: domain=${parsed.domain} expr="${parsed.expression}"`);

    // Basic evaluation for simple numeric expressions
    try {
      if (parsed.domain === 'algebra' && /^[0-9+\-*/().^ ]+$/.test(parsed.expression)) {
        const sanitized = parsed.expression.replace(/\^/g, '**');
        const result = Function(`"use strict"; return (${sanitized})`)();
        return { success: true, data: { expression: parsed.expression, result, domain: parsed.domain, method: 'direct_eval' } };
      }
    } catch { /* fall through to Claude delegation */ }

    return {
      success: true,
      data: {
        expression: parsed.expression,
        domain: parsed.domain,
        variables: parsed.variables,
        result: null,
        method: 'requires_claude_reasoning',
        note: 'Complex expression — delegated to orchestrator AI reasoning',
      },
    };
  },
};

// ── Physics Engine ──

const PhysicsInput = z.object({
  domain: z.enum(['kinematics', 'electromagnetic', 'thermodynamic', 'quantum', 'optics']),
  problem: z.string(),
  knownValues: z.record(z.string(), z.number()).optional(),
  units: z.string().optional(),
});

export const physicsEngineTool: ToolDefinition = {
  name: 'physics_engine',
  description: 'Solve physics problems across kinematics, electromagnetism, thermodynamics, quantum mechanics, and optics.',
  category: 'computation',
  inputSchema: PhysicsInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = PhysicsInput.parse(input);
    ctx.logger.info(`Physics engine: domain=${parsed.domain}`);

    // Built-in kinematics solver
    if (parsed.domain === 'kinematics' && parsed.knownValues) {
      const kv = parsed.knownValues;
      const results: Record<string, number> = {};

      // v = u + at
      if (kv.u !== undefined && kv.a !== undefined && kv.t !== undefined) {
        results.v = kv.u + kv.a * kv.t;
      }
      // s = ut + 0.5at^2
      if (kv.u !== undefined && kv.a !== undefined && kv.t !== undefined) {
        results.s = kv.u * kv.t + 0.5 * kv.a * kv.t * kv.t;
      }

      if (Object.keys(results).length > 0) {
        return { success: true, data: { domain: parsed.domain, knownValues: kv, computed: results, method: 'built_in' } };
      }
    }

    return {
      success: true,
      data: { domain: parsed.domain, problem: parsed.problem, knownValues: parsed.knownValues, result: null, method: 'requires_claude_reasoning' },
    };
  },
};

// ── Economics Model ──

const EconomicsInput = z.object({
  modelType: z.enum(['supply_demand', 'game_theory', 'market_equilibrium', 'regression', 'monte_carlo']),
  parameters: z.record(z.string(), z.unknown()),
});

export const economicsModelTool: ToolDefinition = {
  name: 'economics_model',
  description: 'Run economic models — supply/demand, game theory, market equilibrium, regression analysis, Monte Carlo simulation.',
  category: 'computation',
  inputSchema: EconomicsInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = EconomicsInput.parse(input);
    ctx.logger.info(`Economics model: ${parsed.modelType}`);

    // Monte Carlo simulation
    if (parsed.modelType === 'monte_carlo') {
      const trials = (parsed.parameters.trials as number) || 1000;
      const mean = (parsed.parameters.mean as number) || 0;
      const stddev = (parsed.parameters.stddev as number) || 1;

      const results: number[] = [];
      for (let i = 0; i < trials; i++) {
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        results.push(mean + stddev * z);
      }

      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      const sorted = [...results].sort((a, b) => a - b);

      return {
        success: true,
        data: {
          modelType: parsed.modelType,
          trials,
          mean: avg,
          median: sorted[Math.floor(sorted.length / 2)],
          p5: sorted[Math.floor(sorted.length * 0.05)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          method: 'built_in',
        },
      };
    }

    return {
      success: true,
      data: { modelType: parsed.modelType, parameters: parsed.parameters, result: null, method: 'requires_claude_reasoning' },
    };
  },
};

// ── Vortex Math ──

const VortexInput = z.object({
  operation: z.enum(['digital_root', 'toroidal_pattern', 'fibonacci_sequence', 'vortex_reduction', 'modular_arithmetic']),
  input: z.union([z.number(), z.array(z.number())]),
  modulus: z.number().default(9),
});

export const vortexMathTool: ToolDefinition = {
  name: 'vortex_math',
  description: 'Perform vortex mathematics — digital root computation, toroidal patterns, Fibonacci sequences, vortex reduction, modular arithmetic.',
  category: 'computation',
  inputSchema: VortexInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = VortexInput.parse(input);
    ctx.logger.info(`Vortex math: ${parsed.operation}`);

    const digitalRoot = (n: number): number => {
      if (n === 0) return 0;
      return 1 + ((Math.abs(n) - 1) % 9);
    };

    let result: unknown;

    switch (parsed.operation) {
      case 'digital_root': {
        const n = typeof parsed.input === 'number' ? parsed.input : parsed.input[0];
        result = { input: n, digitalRoot: digitalRoot(n) };
        break;
      }

      case 'fibonacci_sequence': {
        const count = typeof parsed.input === 'number' ? parsed.input : parsed.input[0];
        const fib: number[] = [0, 1];
        for (let i = 2; i < count; i++) fib.push(fib[i - 1] + fib[i - 2]);
        const roots = fib.map(digitalRoot);
        result = { count, fibonacci: fib.slice(0, count), digitalRoots: roots.slice(0, count), pattern: roots.slice(0, 24).join('') };
        break;
      }

      case 'vortex_reduction': {
        const nums = typeof parsed.input === 'number' ? [parsed.input] : parsed.input;
        const reductions = nums.map(n => {
          const steps: number[] = [n];
          let current = n;
          while (current >= 10) {
            current = String(current).split('').reduce((s, d) => s + parseInt(d), 0);
            steps.push(current);
          }
          return { original: n, steps, root: current };
        });
        result = { reductions };
        break;
      }

      case 'toroidal_pattern': {
        const n = typeof parsed.input === 'number' ? parsed.input : parsed.input[0];
        const pattern: number[][] = [];
        for (let i = 1; i <= n; i++) {
          const row: number[] = [];
          for (let j = 1; j <= n; j++) {
            row.push(digitalRoot(i * j));
          }
          pattern.push(row);
        }
        result = { size: n, pattern };
        break;
      }

      case 'modular_arithmetic': {
        const nums = typeof parsed.input === 'number' ? [parsed.input] : parsed.input;
        result = { inputs: nums, modulus: parsed.modulus, results: nums.map(n => n % parsed.modulus) };
        break;
      }
    }

    return { success: true, data: { operation: parsed.operation, ...result as Record<string, unknown> } };
  },
};

// ── Statistics Engine ──

const StatsInput = z.object({
  operation: z.enum(['descriptive', 'regression', 'hypothesis_test', 'bayesian_inference', 'correlation', 'anova']),
  data: z.union([z.array(z.number()), z.array(z.array(z.number()))]),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const statisticsEngineTool: ToolDefinition = {
  name: 'statistics_engine',
  description: 'Perform statistical analysis — descriptive stats, regression, hypothesis testing, Bayesian inference, correlation, ANOVA.',
  category: 'computation',
  inputSchema: StatsInput,
  requiresApproval: false,
  riskLevel: 'low',
  async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
    const parsed = StatsInput.parse(input);
    ctx.logger.info(`Statistics: ${parsed.operation} n=${Array.isArray(parsed.data[0]) ? parsed.data.length + 'x' + (parsed.data[0] as number[]).length : parsed.data.length}`);

    if (parsed.operation === 'descriptive') {
      const nums = parsed.data.flat() as number[];
      const n = nums.length;
      const mean = nums.reduce((a, b) => a + b, 0) / n;
      const sorted = [...nums].sort((a, b) => a - b);
      const variance = nums.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);

      return {
        success: true,
        data: {
          operation: 'descriptive',
          n,
          mean,
          median: n % 2 ? sorted[Math.floor(n / 2)] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
          stddev: Math.sqrt(variance),
          variance,
          min: sorted[0],
          max: sorted[n - 1],
          range: sorted[n - 1] - sorted[0],
          q1: sorted[Math.floor(n * 0.25)],
          q3: sorted[Math.floor(n * 0.75)],
        },
      };
    }

    if (parsed.operation === 'correlation') {
      const flat = parsed.data as number[][];
      if (flat.length >= 2 && Array.isArray(flat[0])) {
        const x = flat[0];
        const y = flat[1];
        const n = Math.min(x.length, y.length);
        const mx = x.reduce((a, b) => a + b, 0) / n;
        const my = y.reduce((a, b) => a + b, 0) / n;
        let num = 0, dx = 0, dy = 0;
        for (let i = 0; i < n; i++) {
          num += (x[i] - mx) * (y[i] - my);
          dx += (x[i] - mx) ** 2;
          dy += (y[i] - my) ** 2;
        }
        const r = num / Math.sqrt(dx * dy);
        return { success: true, data: { operation: 'correlation', r, rSquared: r * r, n } };
      }
    }

    return {
      success: true,
      data: { operation: parsed.operation, dataSize: parsed.data.length, result: null, method: 'requires_claude_reasoning' },
    };
  },
};

export const quantitativeTools: ToolDefinition[] = [
  mathSolverTool, physicsEngineTool, economicsModelTool, vortexMathTool, statisticsEngineTool,
];
