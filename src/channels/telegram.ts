// ═══════════════════════════════════════════════════════════════
// Channel :: Telegram Bot
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { BaseChannel } from './base.js';

export class TelegramChannel extends BaseChannel {
  readonly name = 'Telegram';
  readonly type: ChannelType = 'telegram';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: true,
    canReact: true, canThread: true, canVoice: true, maxMessageLength: 4096,
  };
  private bot: any = null;

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    if (!CONFIG.telegram.botToken) {
      this.logger.warn('Telegram: no bot token configured — channel disabled');
      return;
    }
    try {
      const TelegramBot = (await import('node-telegram-bot-api')).default;
      this.bot = new TelegramBot(CONFIG.telegram.botToken, { polling: true });

      this.bot.on('message', (msg: any) => {
        const channelMsg: ChannelMessage = {
          id: uuid(),
          channelType: 'telegram',
          direction: 'inbound',
          senderId: String(msg.from?.id || ''),
          recipientId: String(msg.chat?.id || ''),
          content: msg.text || '',
          metadata: { chatType: msg.chat?.type, firstName: msg.from?.first_name, username: msg.from?.username },
          timestamp: new Date(msg.date * 1000),
        };
        this.bufferMessage(channelMsg);
      });

      this.connected = true;
      this.logger.info('Telegram channel connected');
    } catch (err) {
      this.logger.error(`Telegram connection failed: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stopPolling?.();
      this.bot = null;
    }
    this.connected = false;
    this.logger.info('Telegram channel disconnected');
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'telegram', direction: 'outbound',
      senderId: 'bot', recipientId, content, metadata: metadata || {}, timestamp: new Date(),
    };

    if (this.bot && this.connected) {
      try {
        await this.bot.sendMessage(recipientId, content, { parse_mode: 'Markdown' });
      } catch (err) {
        msg.metadata.error = String(err);
      }
    } else {
      msg.metadata.queued = true;
    }

    this.bufferMessage(msg);
    return msg;
  }
}
