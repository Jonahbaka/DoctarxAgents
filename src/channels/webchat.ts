// ═══════════════════════════════════════════════════════════════
// Channel :: Web Chat (embeddable widget for DoctaRx platform)
// REST API + WebSocket for real-time browser chat
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { ChannelCapabilities, ChannelMessage, ChannelType, LoggerHandle } from '../core/types.js';
import { BaseChannel } from './base.js';

export class WebChatChannel extends BaseChannel {
  readonly name = 'WebChat';
  readonly type: ChannelType = 'webchat';
  readonly capabilities: ChannelCapabilities = {
    canSendText: true, canSendMedia: true, canCreatePolls: true,
    canReact: true, canThread: true, canVoice: false, maxMessageLength: 10000,
  };
  private sessions: Map<string, { userId: string; startedAt: Date; lastActivity: Date }> = new Map();

  constructor(logger: LoggerHandle) { super(logger); }

  async connect(): Promise<void> {
    // WebChat is always available — messages routed through gateway WebSocket
    this.connected = true;
    this.logger.info('WebChat channel ready');
    this.logger.info('  Endpoint: Gateway WebSocket /ws (channel: webchat)');
    this.logger.info('  REST API: POST /api/webhooks/webchat');
  }

  async disconnect(): Promise<void> {
    this.sessions.clear();
    this.connected = false;
    this.logger.info('WebChat channel disconnected');
  }

  createSession(userId: string): string {
    const sessionId = uuid();
    this.sessions.set(sessionId, { userId, startedAt: new Date(), lastActivity: new Date() });
    return sessionId;
  }

  async sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage> {
    const msg: ChannelMessage = {
      id: uuid(), channelType: 'webchat', direction: 'outbound',
      senderId: 'agent', recipientId, content,
      metadata: { ...metadata, sessionId: metadata?.sessionId }, timestamp: new Date(),
    };

    // Update session activity
    for (const [sid, session] of this.sessions) {
      if (session.userId === recipientId) {
        session.lastActivity = new Date();
        break;
      }
    }

    this.bufferMessage(msg);
    return msg;
  }

  // Handle inbound from gateway webhook
  handleInbound(sessionId: string, userId: string, content: string, metadata?: Record<string, unknown>): ChannelMessage {
    const session = this.sessions.get(sessionId);
    if (session) session.lastActivity = new Date();

    const msg: ChannelMessage = {
      id: uuid(), channelType: 'webchat', direction: 'inbound',
      senderId: userId, recipientId: 'agent', content,
      metadata: { sessionId, ...metadata }, timestamp: new Date(),
    };

    this.bufferMessage(msg);
    return msg;
  }

  getActiveSessions(): number { return this.sessions.size; }
}
