// ═══════════════════════════════════════════════════════════════
// Channel :: Slack Bot
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { BaseChannel } from './base.js';

export class SlackChannel extends BaseChannel {
  readonly name = 'Slack';
  readonly type: ChannelType = 'slack';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: false,
    canReact: true, canThread: true, canVoice: false, maxMessageLength: 40000,
  };

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    if (!CONFIG.slack.botToken) {
      this.logger.warn('Slack: no bot token configured — channel disabled');
      return;
    }
    // In production: use @slack/bolt or @slack/web-api
    this.connected = true;
    this.logger.info('Slack channel ready');
    this.logger.info('  Note: Install @slack/bolt for full Slack integration');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.info('Slack channel disconnected');
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'slack', direction: 'outbound',
      senderId: 'bot', recipientId, content,
      metadata: { ...metadata, status: 'awaiting_slack_bolt_integration' }, timestamp: new Date(),
    };

    if (this.connected && CONFIG.slack.botToken) {
      try {
        const resp = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${CONFIG.slack.botToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: recipientId, text: content }),
        });
        const data = await resp.json() as Record<string, unknown>;
        msg.metadata.slackTs = data.ts;
        msg.metadata.ok = data.ok;
      } catch (err) {
        msg.metadata.error = String(err);
      }
    }

    this.bufferMessage(msg);
    return msg;
  }
}
