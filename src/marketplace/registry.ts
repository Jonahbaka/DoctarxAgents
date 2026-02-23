// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Marketplace Registry
// SQLite-backed runtime tool registration for external developers
// ═══════════════════════════════════════════════════════════════

import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import type { LoggerHandle, MarketplaceTool, ToolDefinition } from '../core/types.js';

export class MarketplaceRegistry {
  private db: Database.Database;
  private logger: LoggerHandle;

  constructor(db: Database.Database, logger: LoggerHandle) {
    this.db = db;
    this.logger = logger;
    this.initSchema();
  }

  // ── Schema ──

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_tools (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        webhook_url TEXT NOT NULL,
        input_schema TEXT NOT NULL,
        registered_by TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        invocation_count INTEGER DEFAULT 0,
        avg_latency_ms REAL DEFAULT 0,
        status TEXT DEFAULT 'active'
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_status ON marketplace_tools(status)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_marketplace_name ON marketplace_tools(name)
    `);

    const count = (this.db.prepare('SELECT COUNT(*) as cnt FROM marketplace_tools').get() as { cnt: number }).cnt;
    this.logger.info(`[Marketplace] Registry initialized (${count} tools)`);
  }

  // ── Register ──

  register(tool: {
    name: string;
    description: string;
    webhookUrl: string;
    inputSchema: Record<string, unknown>;
    registeredBy: string;
  }): MarketplaceTool {
    const id = uuid();
    const registeredAt = new Date();

    this.db.prepare(`
      INSERT INTO marketplace_tools (id, name, description, webhook_url, input_schema, registered_by, registered_at, invocation_count, avg_latency_ms, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'active')
    `).run(
      id,
      tool.name,
      tool.description,
      tool.webhookUrl,
      JSON.stringify(tool.inputSchema),
      tool.registeredBy,
      registeredAt.toISOString(),
    );

    this.logger.info(`[Marketplace] Tool registered: ${tool.name} by ${tool.registeredBy}`);

    return {
      id,
      name: tool.name,
      description: tool.description,
      webhookUrl: tool.webhookUrl,
      inputSchema: tool.inputSchema,
      registeredBy: tool.registeredBy,
      registeredAt,
      invocationCount: 0,
      avgLatencyMs: 0,
      status: 'active',
    };
  }

  // ── List ──

  list(filter?: { status?: string; registeredBy?: string }): MarketplaceTool[] {
    let query = 'SELECT * FROM marketplace_tools WHERE 1=1';
    const params: unknown[] = [];

    if (filter?.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }
    if (filter?.registeredBy) {
      query += ' AND registered_by = ?';
      params.push(filter.registeredBy);
    }

    query += ' ORDER BY registered_at DESC';

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToTool(r));
  }

  // ── Get ──

  get(id: string): MarketplaceTool | null {
    const row = this.db.prepare('SELECT * FROM marketplace_tools WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToTool(row) : null;
  }

  // ── Invoke ──

  async invoke(id: string, input: Record<string, unknown>): Promise<{ success: boolean; data: unknown; latencyMs: number }> {
    const tool = this.get(id);
    if (!tool) throw new Error(`Marketplace tool not found: ${id}`);
    if (tool.status !== 'active') throw new Error(`Marketplace tool disabled: ${tool.name}`);

    const start = Date.now();

    try {
      const resp = await fetch(tool.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: id, toolName: tool.name, input }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await resp.json();
      const latencyMs = Date.now() - start;

      // Update stats
      const newCount = tool.invocationCount + 1;
      const newAvg = ((tool.avgLatencyMs * tool.invocationCount) + latencyMs) / newCount;

      this.db.prepare(`
        UPDATE marketplace_tools SET invocation_count = ?, avg_latency_ms = ? WHERE id = ?
      `).run(newCount, newAvg, id);

      this.logger.info(`[Marketplace] Invoked ${tool.name} (${latencyMs}ms)`);

      return { success: resp.ok, data, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;

      // Still count the invocation
      this.db.prepare(`
        UPDATE marketplace_tools SET invocation_count = invocation_count + 1 WHERE id = ?
      `).run(id);

      this.logger.error(`[Marketplace] Invoke failed for ${tool.name}: ${err}`);
      return { success: false, data: { error: String(err) }, latencyMs };
    }
  }

  // ── Enable / Disable ──

  disable(id: string): void {
    this.db.prepare('UPDATE marketplace_tools SET status = ? WHERE id = ?').run('disabled', id);
    this.logger.info(`[Marketplace] Tool disabled: ${id}`);
  }

  enable(id: string): void {
    this.db.prepare('UPDATE marketplace_tools SET status = ? WHERE id = ?').run('active', id);
    this.logger.info(`[Marketplace] Tool enabled: ${id}`);
  }

  // ── Stats ──

  getStats(): { total: number; active: number; totalInvocations: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(invocation_count) as totalInvocations
      FROM marketplace_tools
    `).get() as { total: number; active: number; totalInvocations: number };

    return {
      total: row.total || 0,
      active: row.active || 0,
      totalInvocations: row.totalInvocations || 0,
    };
  }

  // ── Convert to ToolDefinitions ──

  toToolDefinitions(): ToolDefinition[] {
    const tools = this.list({ status: 'active' });
    return tools.map(tool => ({
      name: `marketplace:${tool.name}`,
      description: `[Marketplace] ${tool.description}`,
      category: 'marketplace' as const,
      inputSchema: z.record(z.string(), z.unknown()),
      requiresApproval: true,
      riskLevel: 'medium' as const,
      execute: async (input: unknown) => {
        const result = await this.invoke(tool.id, input as Record<string, unknown>);
        return {
          success: result.success,
          data: result.data,
          metadata: { latencyMs: result.latencyMs, toolId: tool.id },
        };
      },
    }));
  }

  // ── Row Mapper ──

  private rowToTool(row: Record<string, unknown>): MarketplaceTool {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      webhookUrl: row.webhook_url as string,
      inputSchema: JSON.parse(row.input_schema as string),
      registeredBy: row.registered_by as string,
      registeredAt: new Date(row.registered_at as string),
      invocationCount: row.invocation_count as number,
      avgLatencyMs: row.avg_latency_ms as number,
      status: row.status as 'active' | 'disabled',
    };
  }
}
