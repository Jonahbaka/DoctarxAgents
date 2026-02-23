// ═══════════════════════════════════════════════════════════════
// Agent: Agora — Agentic Marketplace
// 3 tools: register, list, invoke external tools at runtime
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { ToolDefinition } from '../../core/types.js';
import { MarketplaceRegistry } from '../../marketplace/registry.js';

// ── Factory (needs registry instance) ──

export function createMarketplaceTools(registry: MarketplaceRegistry): ToolDefinition[] {
  return [
    // ─── 1. Register External Tool ────────────────────────────
    {
      name: 'marketplace_register_tool',
      description: 'Register an external tool in the DoctaRx Marketplace. Any agent can then invoke it. The tool must expose a POST webhook that accepts JSON { toolId, toolName, input } and returns JSON.',
      category: 'marketplace',
      inputSchema: z.object({
        name: z.string().min(1).max(64).describe('Unique tool name (lowercase, no spaces — use underscores)'),
        description: z.string().min(10).max(500).describe('What the tool does'),
        webhookUrl: z.string().url().describe('HTTPS endpoint that accepts POST with JSON body'),
        inputSchema: z.record(z.string(), z.unknown()).optional().default({}).describe('JSON Schema for the tool input (optional)'),
        registeredBy: z.string().min(1).describe('Developer or org name registering this tool'),
      }),
      requiresApproval: true,
      riskLevel: 'high',
      execute: async (input, ctx) => {
        const params = z.object({
          name: z.string().min(1).max(64),
          description: z.string().min(10).max(500),
          webhookUrl: z.string().url(),
          inputSchema: z.record(z.string(), z.unknown()).optional().default({}),
          registeredBy: z.string().min(1),
        }).parse(input);

        ctx.logger.info(`[Agora] Registering marketplace tool: ${params.name} by ${params.registeredBy}`);

        // Validate webhook is reachable
        try {
          const probe = await fetch(params.webhookUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000),
          });
          if (!probe.ok && probe.status !== 405) {
            // 405 Method Not Allowed is acceptable (HEAD not supported but POST may work)
            return {
              success: false,
              data: null,
              error: `Webhook unreachable: ${params.webhookUrl} returned ${probe.status}`,
            };
          }
        } catch (err) {
          return {
            success: false,
            data: null,
            error: `Webhook unreachable: ${params.webhookUrl} — ${err}`,
          };
        }

        try {
          const tool = registry.register({
            name: params.name,
            description: params.description,
            webhookUrl: params.webhookUrl,
            inputSchema: params.inputSchema,
            registeredBy: params.registeredBy,
          });

          return {
            success: true,
            data: {
              toolId: tool.id,
              name: tool.name,
              status: tool.status,
              registeredAt: tool.registeredAt.toISOString(),
              message: `Tool "${tool.name}" registered. Any DoctaRx agent can now invoke it via marketplace_invoke_tool.`,
            },
          };
        } catch (err) {
          return { success: false, data: null, error: `Registration failed: ${err}` };
        }
      },
    },

    // ─── 2. List Marketplace Tools ────────────────────────────
    {
      name: 'marketplace_list_tools',
      description: 'Browse all tools registered in the DoctaRx Marketplace. Filter by status or developer.',
      category: 'marketplace',
      inputSchema: z.object({
        status: z.enum(['active', 'disabled', 'all']).optional().default('active'),
        registeredBy: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      }),
      requiresApproval: false,
      riskLevel: 'low',
      execute: async (input, ctx) => {
        const params = z.object({
          status: z.enum(['active', 'disabled', 'all']).optional().default('active'),
          registeredBy: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional().default(50),
        }).parse(input);

        ctx.logger.info(`[Agora] Listing marketplace tools (status=${params.status})`);

        const filter: { status?: string; registeredBy?: string } = {};
        if (params.status !== 'all') filter.status = params.status;
        if (params.registeredBy) filter.registeredBy = params.registeredBy;

        const tools = registry.list(filter).slice(0, params.limit);
        const stats = registry.getStats();

        return {
          success: true,
          data: {
            tools: tools.map(t => ({
              id: t.id,
              name: t.name,
              description: t.description,
              webhookUrl: t.webhookUrl,
              registeredBy: t.registeredBy,
              status: t.status,
              invocations: t.invocationCount,
              avgLatencyMs: Math.round(t.avgLatencyMs),
              registeredAt: t.registeredAt.toISOString(),
            })),
            count: tools.length,
            stats,
          },
        };
      },
    },

    // ─── 3. Invoke Marketplace Tool ───────────────────────────
    {
      name: 'marketplace_invoke_tool',
      description: 'Execute a registered marketplace tool by ID. Input is forwarded to the tool\'s webhook as JSON.',
      category: 'marketplace',
      inputSchema: z.object({
        toolId: z.string().uuid().describe('The marketplace tool ID'),
        input: z.record(z.string(), z.unknown()).optional().default({}).describe('Input payload forwarded to the webhook'),
      }),
      requiresApproval: false,
      riskLevel: 'medium',
      execute: async (input, ctx) => {
        const params = z.object({
          toolId: z.string().uuid(),
          input: z.record(z.string(), z.unknown()).optional().default({}),
        }).parse(input);

        ctx.logger.info(`[Agora] Invoking marketplace tool: ${params.toolId}`);

        const tool = registry.get(params.toolId);
        if (!tool) {
          return { success: false, data: null, error: `Tool not found: ${params.toolId}` };
        }
        if (tool.status !== 'active') {
          return { success: false, data: null, error: `Tool is disabled: ${tool.name}` };
        }

        try {
          const result = await registry.invoke(params.toolId, params.input);

          return {
            success: result.success,
            data: {
              toolName: tool.name,
              result: result.data,
              latencyMs: result.latencyMs,
            },
            metadata: { toolId: params.toolId, webhookUrl: tool.webhookUrl },
          };
        } catch (err) {
          return { success: false, data: null, error: `Invocation failed: ${err}` };
        }
      },
    },
  ];
}
