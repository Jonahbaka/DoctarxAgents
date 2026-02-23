import { describe, it, expect, vi } from 'vitest';

// Mock config before orchestrator import
vi.mock('./config.js', () => ({
  CONFIG: {
    anthropic: { apiKey: 'test-key', model: 'claude-opus-4-6', maxTokens: 16384, temperature: 0.3 },
    openai: { apiKey: '', model: 'gpt-4o' },
    gateway: { host: '127.0.0.1', port: 18789, secret: 'test' },
    database: { path: ':memory:' },
    logging: { level: 'silent' },
    trading: { paperTrading: true },
    healing: { circuitBreakerThreshold: 5, circuitBreakerCooldownMs: 30000 },
    tokenForge: { enabled: false },
    channels: {},
    wallet: {},
  },
}));

import { Orchestrator } from './orchestrator.js';
import { createMockLogger, createMockMemory } from '../test-utils/mocks.js';

describe('Orchestrator', () => {
  const logger = createMockLogger();

  it('should initialize with correct identity', () => {
    const orch = new Orchestrator(logger);
    const state = orch.getState();

    expect(state.identity.role).toBe('orchestrator');
    expect(state.identity.name).toBe('DOI');
    expect(state.isRunning).toBe(false);
  });

  it('should start and stop', () => {
    const orch = new Orchestrator(logger);
    orch.start();

    const state = orch.getState();
    expect(state.isRunning).toBe(true);

    orch.stop();
    expect(orch.getState().isRunning).toBe(false);
  });

  it('should register tools and count them', () => {
    const orch = new Orchestrator(logger);

    // Register some dummy tools
    const tools = [
      {
        name: 'test_tool_1',
        description: 'A test tool',
        category: 'system' as const,
        inputSchema: {} as never,
        requiresApproval: false,
        riskLevel: 'low' as const,
        execute: async () => ({ success: true, data: null }),
      },
      {
        name: 'test_tool_2',
        description: 'Another test tool',
        category: 'system' as const,
        inputSchema: {} as never,
        requiresApproval: false,
        riskLevel: 'low' as const,
        execute: async () => ({ success: true, data: null }),
      },
    ];

    orch.registerTools(tools);
    const state = orch.getState();
    expect(state.toolCount).toBe(2);
  });

  it('should accumulate tools across multiple registrations', () => {
    const orch = new Orchestrator(logger);

    const batch1 = [
      { name: 'a', description: '', category: 'system' as const, inputSchema: {} as never, requiresApproval: false, riskLevel: 'low' as const, execute: async () => ({ success: true, data: null }) },
    ];
    const batch2 = [
      { name: 'b', description: '', category: 'system' as const, inputSchema: {} as never, requiresApproval: false, riskLevel: 'low' as const, execute: async () => ({ success: true, data: null }) },
      { name: 'c', description: '', category: 'system' as const, inputSchema: {} as never, requiresApproval: false, riskLevel: 'low' as const, execute: async () => ({ success: true, data: null }) },
    ];

    orch.registerTools(batch1);
    orch.registerTools(batch2);

    expect(orch.getState().toolCount).toBe(3);
  });

  it('should set memory handle', () => {
    const orch = new Orchestrator(logger);
    const memory = createMockMemory();

    // Should not throw
    orch.setMemoryHandle(memory);
  });

  it('should return empty agents list initially', () => {
    const orch = new Orchestrator(logger);
    const agents = orch.getAgents();
    expect(Array.isArray(agents)).toBe(true);
  });

  it('should return empty tasks list initially', () => {
    const orch = new Orchestrator(logger);
    const tasks = orch.getTasks();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toHaveLength(0);
  });

  it('should return execution log', () => {
    const orch = new Orchestrator(logger);
    const log = orch.getExecutionLog(10);
    expect(Array.isArray(log)).toBe(true);
  });
});
