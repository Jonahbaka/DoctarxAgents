// ═══════════════════════════════════════════════════════════════
// Channel :: Discord Bot
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { BaseChannel } from './base.js';

export class DiscordChannel extends BaseChannel {
  readonly name = 'Discord';
  readonly type: ChannelType = 'discord';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: true,
    canReact: true, canThread: true, canVoice: false, maxMessageLength: 2000,
  };
  private client: any = null;

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    if (!CONFIG.discord.botToken) {
      this.logger.warn('Discord: no bot token configured — channel disabled');
      return;
    }
    try {
      const { Client, GatewayIntentBits } = await import('discord.js');
      this.client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
      });

      this.client.on('messageCreate', (msg: any) => {
        if (msg.author.bot) return;
        const channelMsg: ChannelMessage = {
          id: uuid(), channelType: 'discord', direction: 'inbound',
          senderId: msg.author.id, recipientId: msg.channelId,
          content: msg.content,
          metadata: { username: msg.author.username, guildId: msg.guildId },
          timestamp: new Date(msg.createdTimestamp),
        };
        this.bufferMessage(channelMsg);
      });

      await this.client.login(CONFIG.discord.botToken);
      this.connected = true;
      this.logger.info('Discord channel connected');
    } catch (err) {
      this.logger.error(`Discord connection failed: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.connected = false;
    this.logger.info('Discord channel disconnected');
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'discord', direction: 'outbound',
      senderId: 'bot', recipientId, content, metadata: metadata || {}, timestamp: new Date(),
    };

    if (this.client && this.connected) {
      try {
        const channel = await this.client.channels.fetch(recipientId);
        if (channel?.isTextBased?.()) await channel.send(content);
      } catch (err) {
        msg.metadata.error = String(err);
      }
    }

    this.bufferMessage(msg);
    return msg;
  }
}
