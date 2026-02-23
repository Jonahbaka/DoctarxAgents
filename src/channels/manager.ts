// ═══════════════════════════════════════════════════════════════
// Channel Manager — Plug-and-play orchestrator for all channels
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'eventemitter3';
import { ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { BaseChannel } from './base.js';

export class ChannelManager extends EventEmitter {
  private channels: Map<ChannelType, BaseChannel> = new Map();
  private logger: LoggerHandle;

  constructor(logger: LoggerHandle) {
    super();
    this.logger = logger;
  }

  registerChannel(channel: BaseChannel): void {
    this.channels.set(channel.type, channel);
    channel.on('message', (msg: ChannelMessage) => {
      this.emit('message', msg);
    });
    this.logger.info(`Channel registered: ${channel.name} (${channel.type})`);
  }

  async connectAll(): Promise<void> {
    for (const [type, channel] of this.channels) {
      try {
        await channel.connect();
      } catch (err) {
        this.logger.error(`Failed to connect ${type}: ${err}`);
      }
    }
    this.logger.info(`Channels connected: ${this.getConnectedCount()}/${this.channels.size}`);
  }

  async disconnectAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try { await channel.disconnect(); } catch { /* best effort */ }
    }
  }

  getChannel(type: ChannelType): BaseChannel | undefined {
    return this.channels.get(type);
  }

  async sendMessage(channelType: ChannelType, recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage | null> {
    const channel = this.channels.get(channelType);
    if (!channel) {
      this.logger.warn(`Channel not registered: ${channelType}`);
      return null;
    }
    if (!channel.isConnected()) {
      this.logger.warn(`Channel not connected: ${channelType}`);
      return null;
    }
    return channel.sendMessage(recipientId, content, metadata);
  }

  getConnectedCount(): number {
    return Array.from(this.channels.values()).filter(c => c.isConnected()).length;
  }

  getStatus(): Array<{ type: ChannelType; name: string; connected: boolean; capabilities: Record<string, boolean> }> {
    return Array.from(this.channels.values()).map(c => ({
      type: c.type,
      name: c.name,
      connected: c.isConnected(),
      capabilities: c.capabilities as unknown as Record<string, boolean>,
    }));
  }
}
