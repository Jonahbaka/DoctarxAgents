// ═══════════════════════════════════════════════════════════════
// Agent::Messaging_Ops (Hermes)
// Multi-channel communication — Telegram, WhatsApp, Discord,
// Slack, SMS, WebChat, Phone
// ═══════════════════════════════════════════════════════════════

import { ToolDefinition, ToolResult, ExecutionContext, ChannelType } from '../../core/types.js';
import { z } from 'zod';
import type { ChannelManager } from '../../channels/manager.js';

const channelEnum = z.enum(['telegram', 'whatsapp', 'discord', 'slack', 'sms', 'webchat', 'phone']);

// Factory: tools close over the ChannelManager reference
export function createMessagingTools(channelManager: ChannelManager): ToolDefinition[] {

  // ── Send Message ──
  const SendInput = z.object({
    channel: channelEnum,
    recipientId: z.string(),
    content: z.string(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });

  const sendMessageTool: ToolDefinition = {
    name: 'send_message',
    description: 'Send a message via any connected channel — Telegram, WhatsApp, Discord, Slack, SMS, WebChat.',
    category: 'messaging',
    inputSchema: SendInput,
    requiresApproval: true,
    riskLevel: 'medium',
    async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
      const parsed = SendInput.parse(input);
      ctx.logger.info(`Send message: ${parsed.channel} -> ${parsed.recipientId}`);
      const msg = await channelManager.sendMessage(parsed.channel as ChannelType, parsed.recipientId, parsed.content, parsed.metadata);
      if (msg) {
        return { success: true, data: msg };
      }
      return { success: false, data: null, error: `Channel ${parsed.channel} not available` };
    },
  };

  // ── Receive Messages ──
  const ReceiveInput = z.object({
    channel: channelEnum,
    limit: z.number().default(10),
  });

  const receiveMessageTool: ToolDefinition = {
    name: 'receive_message',
    description: 'Fetch recent inbound messages from a channel.',
    category: 'messaging',
    inputSchema: ReceiveInput,
    requiresApproval: false,
    riskLevel: 'low',
    async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
      const parsed = ReceiveInput.parse(input);
      ctx.logger.info(`Receive messages: ${parsed.channel} limit=${parsed.limit}`);
      const channel = channelManager.getChannel(parsed.channel as ChannelType);
      if (!channel) return { success: false, data: null, error: `Channel ${parsed.channel} not registered` };
      const messages = channel.getRecentMessages(parsed.limit).filter(m => m.direction === 'inbound');
      return { success: true, data: { channel: parsed.channel, messages, count: messages.length } };
    },
  };

  // ── Broadcast Message ──
  const BroadcastInput = z.object({
    channels: z.array(channelEnum),
    recipientIds: z.record(z.string(), z.string()).describe('Map of channel -> recipientId'),
    content: z.string(),
  });

  const broadcastTool: ToolDefinition = {
    name: 'broadcast_message',
    description: 'Broadcast a message across multiple channels simultaneously.',
    category: 'messaging',
    inputSchema: BroadcastInput,
    requiresApproval: true,
    riskLevel: 'high',
    async execute(input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
      const parsed = BroadcastInput.parse(input);
      ctx.logger.info(`Broadcast: ${parsed.channels.join(',')} recipients=${Object.keys(parsed.recipientIds).length}`);
      const results: Array<{ channel: string; success: boolean; error?: string }> = [];
      for (const ch of parsed.channels) {
        const recipientId = parsed.recipientIds[ch];
        if (recipientId) {
          const msg = await channelManager.sendMessage(ch as ChannelType, recipientId, parsed.content);
          results.push({ channel: ch, success: !!msg });
        }
      }
      return { success: true, data: { results, sentCount: results.filter(r => r.success).length } };
    },
  };

  // ── Channel Status ──
  const channelStatusTool: ToolDefinition = {
    name: 'channel_status',
    description: 'Get status of all messaging channels — connected, capabilities, message counts.',
    category: 'messaging',
    inputSchema: z.object({}),
    requiresApproval: false,
    riskLevel: 'low',
    async execute(_input: unknown, ctx: ExecutionContext): Promise<ToolResult> {
      ctx.logger.info('Channel status check');
      return { success: true, data: { channels: channelManager.getStatus(), connectedCount: channelManager.getConnectedCount() } };
    },
  };

  return [sendMessageTool, receiveMessageTool, broadcastTool, channelStatusTool];
}
