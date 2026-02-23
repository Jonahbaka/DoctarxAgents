import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreakerRegistry } from './circuit-breaker.js';
import { createMockLogger } from '../test-utils/mocks.js';

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;
  const config = { circuitBreakerThreshold: 3, circuitBreakerCooldownMs: 1000 };

  beforeEach(() => {
    registry = new CircuitBreakerRegistry(config, createMockLogger());
  });

  it('should allow execution for unknown tools (default closed)', () => {
    expect(registry.canExecute('new_tool')).toBe(true);
  });

  it('should remain closed below failure threshold', () => {
    registry.recordFailure('tool-a');
    registry.recordFailure('tool-a');
    expect(registry.canExecute('tool-a')).toBe(true);

    const states = registry.getState();
    const toolA = states.find(s => s.toolName === 'tool-a');
    expect(toolA?.state).toBe('closed');
    expect(toolA?.failureCount).toBe(2);
  });

  it('should open after reaching failure threshold', () => {
    registry.recordFailure('tool-b');
    registry.recordFailure('tool-b');
    registry.recordFailure('tool-b');

    const states = registry.getState();
    const toolB = states.find(s => s.toolName === 'tool-b');
    expect(toolB?.state).toBe('open');
    expect(toolB?.failureCount).toBe(3);
  });

  it('should block execution when open', () => {
    for (let i = 0; i < 3; i++) registry.recordFailure('tool-c');
    expect(registry.canExecute('tool-c')).toBe(false);
  });

  it('should transition to half_open after cooldown', async () => {
    // Use a very short cooldown for testing
    const fastRegistry = new CircuitBreakerRegistry(
      { circuitBreakerThreshold: 2, circuitBreakerCooldownMs: 50 },
      createMockLogger()
    );

    fastRegistry.recordFailure('tool-d');
    fastRegistry.recordFailure('tool-d');

    // Should be open
    expect(fastRegistry.canExecute('tool-d')).toBe(false);

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 60));

    // Now canExecute should transition to half_open
    expect(fastRegistry.canExecute('tool-d')).toBe(true);

    const states = fastRegistry.getState();
    const toolD = states.find(s => s.toolName === 'tool-d');
    expect(toolD?.state).toBe('half_open');
  });

  it('should close on success in half_open state', async () => {
    const fastRegistry = new CircuitBreakerRegistry(
      { circuitBreakerThreshold: 2, circuitBreakerCooldownMs: 50 },
      createMockLogger()
    );

    fastRegistry.recordFailure('tool-e');
    fastRegistry.recordFailure('tool-e');

    await new Promise(r => setTimeout(r, 60));
    fastRegistry.canExecute('tool-e'); // triggers half_open

    fastRegistry.recordSuccess('tool-e');

    const states = fastRegistry.getState();
    const toolE = states.find(s => s.toolName === 'tool-e');
    expect(toolE?.state).toBe('closed');
    expect(toolE?.failureCount).toBe(0);
  });

  it('should force-reset a breaker', () => {
    for (let i = 0; i < 3; i++) registry.recordFailure('tool-f');
    expect(registry.canExecute('tool-f')).toBe(false);

    registry.reset('tool-f');

    const states = registry.getState();
    const toolF = states.find(s => s.toolName === 'tool-f');
    expect(toolF?.state).toBe('closed');
    expect(toolF?.failureCount).toBe(0);
    expect(registry.canExecute('tool-f')).toBe(true);
  });

  it('should evaluate and transition open breakers', async () => {
    const fastRegistry = new CircuitBreakerRegistry(
      { circuitBreakerThreshold: 2, circuitBreakerCooldownMs: 50 },
      createMockLogger()
    );

    fastRegistry.recordFailure('tool-g');
    fastRegistry.recordFailure('tool-g');

    await new Promise(r => setTimeout(r, 60));

    const changed = fastRegistry.evaluate();
    expect(changed).toHaveLength(1);
    expect(changed[0].state).toBe('half_open');
  });
});
