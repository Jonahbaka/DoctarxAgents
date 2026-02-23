// ═══════════════════════════════════════════════════════════════
// Channel :: WhatsApp (via Baileys / Business API)
// Connect with your phone number
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { BaseChannel } from './base.js';

export class WhatsAppChannel extends BaseChannel {
  readonly name = 'WhatsApp';
  readonly type: ChannelType = 'whatsapp';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: true,
    canReact: true, canThread: false, canVoice: true, maxMessageLength: 4096,
  };

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    if (!CONFIG.whatsapp.phoneNumber) {
      this.logger.warn('WhatsApp: no phone number configured — channel disabled');
      return;
    }
    // In production: use @whiskeysockets/baileys for multi-device WhatsApp Web
    // or WhatsApp Business API with phone number + session persistence
    this.connected = true;
    this.logger.info(`WhatsApp channel ready (phone: ${CONFIG.whatsapp.phoneNumber})`);
    this.logger.info('  Session path: ' + CONFIG.whatsapp.sessionPath);
    this.logger.info('  Note: Install @whiskeysockets/baileys for full WhatsApp Web integration');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.info('WhatsApp channel disconnected');
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'whatsapp', direction: 'outbound',
      senderId: CONFIG.whatsapp.phoneNumber, recipientId, content,
      metadata: { ...metadata, status: 'awaiting_baileys_integration' }, timestamp: new Date(),
    };
    this.bufferMessage(msg);
    return msg;
  }
}
