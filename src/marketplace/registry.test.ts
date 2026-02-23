import { describe, it, expect, beforeEach } from 'vitest';
import { MarketplaceRegistry } from './registry.js';
import { createTestDb, createMockLogger } from '../test-utils/mocks.js';
import type Database from 'better-sqlite3';

describe('MarketplaceRegistry', () => {
  let db: Database.Database;
  let registry: MarketplaceRegistry;

  beforeEach(() => {
    db = createTestDb();
    registry = new MarketplaceRegistry(db, createMockLogger());
  });

  it('should register a tool', () => {
    const tool = registry.register({
      name: 'weather_api',
      description: 'Get current weather for a location',
      webhookUrl: 'https://example.com/weather',
      inputSchema: { location: 'string' },
      registeredBy: 'test-dev',
    });

    expect(tool.id).toBeDefined();
    expect(tool.name).toBe('weather_api');
    expect(tool.status).toBe('active');
    expect(tool.invocationCount).toBe(0);
  });

  it('should list registered tools', () => {
    registry.register({
      name: 'tool_a',
      description: 'Tool A description',
      webhookUrl: 'https://a.example.com',
      inputSchema: {},
      registeredBy: 'dev-1',
    });
    registry.register({
      name: 'tool_b',
      description: 'Tool B description',
      webhookUrl: 'https://b.example.com',
      inputSchema: {},
      registeredBy: 'dev-2',
    });

    const tools = registry.list();
    expect(tools).toHaveLength(2);
  });

  it('should get a tool by id', () => {
    const created = registry.register({
      name: 'lookup_tool',
      description: 'A tool to look up',
      webhookUrl: 'https://lookup.example.com',
      inputSchema: {},
      registeredBy: 'dev',
    });

    const found = registry.get(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('lookup_tool');
  });

  it('should return null for unknown id', () => {
    const found = registry.get('nonexistent-id');
    expect(found).toBeNull();
  });

  it('should disable and enable tools', () => {
    const tool = registry.register({
      name: 'toggle_tool',
      description: 'A tool to toggle',
      webhookUrl: 'https://toggle.example.com',
      inputSchema: {},
      registeredBy: 'dev',
    });

    registry.disable(tool.id);
    let found = registry.get(tool.id);
    expect(found!.status).toBe('disabled');

    registry.enable(tool.id);
    found = registry.get(tool.id);
    expect(found!.status).toBe('active');
  });

  it('should filter by status', () => {
    const t1 = registry.register({ name: 'active_1', description: 'Active tool', webhookUrl: 'https://a.com', inputSchema: {}, registeredBy: 'dev' });
    const t2 = registry.register({ name: 'active_2', description: 'Will be disabled', webhookUrl: 'https://b.com', inputSchema: {}, registeredBy: 'dev' });
    registry.disable(t2.id);

    const active = registry.list({ status: 'active' });
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('active_1');

    const disabled = registry.list({ status: 'disabled' });
    expect(disabled).toHaveLength(1);
    expect(disabled[0].name).toBe('active_2');
  });

  it('should report correct stats', () => {
    registry.register({ name: 's1', description: 'Stats tool 1', webhookUrl: 'https://s1.com', inputSchema: {}, registeredBy: 'dev' });
    registry.register({ name: 's2', description: 'Stats tool 2', webhookUrl: 'https://s2.com', inputSchema: {}, registeredBy: 'dev' });
    const t3 = registry.register({ name: 's3', description: 'Stats tool 3', webhookUrl: 'https://s3.com', inputSchema: {}, registeredBy: 'dev' });
    registry.disable(t3.id);

    const stats = registry.getStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.totalInvocations).toBe(0);
  });

  it('should enforce unique tool names', () => {
    registry.register({ name: 'unique', description: 'First', webhookUrl: 'https://a.com', inputSchema: {}, registeredBy: 'dev' });
    expect(() => {
      registry.register({ name: 'unique', description: 'Duplicate', webhookUrl: 'https://b.com', inputSchema: {}, registeredBy: 'dev' });
    }).toThrow();
  });

  it('should generate ToolDefinitions from active tools', () => {
    registry.register({ name: 'td_tool', description: 'A marketplace tool', webhookUrl: 'https://td.com', inputSchema: {}, registeredBy: 'dev' });

    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('marketplace:td_tool');
    expect(defs[0].category).toBe('marketplace');
    expect(defs[0].requiresApproval).toBe(true);
  });
});
