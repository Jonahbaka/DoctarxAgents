// ═══════════════════════════════════════════════════════════════
// Channel :: SMS via Twilio
// Connect with your phone number for text messaging
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';
import { BaseChannel } from './base.js';

export class SmsChannel extends BaseChannel {
  readonly name = 'SMS';
  readonly type: ChannelType = 'sms';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: false,
    canReact: false, canThread: false, canVoice: false, maxMessageLength: 1600,
  };

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    if (!CONFIG.sms.twilioAccountSid || !CONFIG.sms.twilioAuthToken) {
      this.logger.warn('SMS: no Twilio credentials — channel disabled');
      return;
    }
    this.connected = true;
    this.logger.info(`SMS channel ready (from: ${CONFIG.sms.twilioPhoneNumber})`);
    this.logger.info('  Inbound: Configure Twilio webhook → POST /api/webhooks/sms');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.info('SMS channel disconnected');
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'sms', direction: 'outbound',
      senderId: CONFIG.sms.twilioPhoneNumber, recipientId, content,
      metadata: metadata || {}, timestamp: new Date(),
    };

    if (this.connected && CONFIG.sms.twilioAccountSid) {
      try {
        const auth = Buffer.from(`${CONFIG.sms.twilioAccountSid}:${CONFIG.sms.twilioAuthToken}`).toString('base64');
        const body = new URLSearchParams({ To: recipientId, From: CONFIG.sms.twilioPhoneNumber, Body: content });
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.sms.twilioAccountSid}/Messages.json`,
          { method: 'POST', headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body }
        );
        const data = await resp.json() as Record<string, unknown>;
        msg.metadata.sid = data.sid;
        msg.metadata.twilioStatus = data.status;
      } catch (err) {
        msg.metadata.error = String(err);
      }
    }

    this.bufferMessage(msg);
    return msg;
  }
}
