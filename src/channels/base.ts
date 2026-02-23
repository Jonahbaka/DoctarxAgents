// ═══════════════════════════════════════════════════════════════
// Channels :: Base Plugin Interface
// Plug-and-play messaging architecture
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'eventemitter3';
import { ChannelMessage, ChannelCapabilities, ChannelType, LoggerHandle } from '../core/types.js';

export abstract class BaseChannel extends EventEmitter {
  abstract readonly name: string;
  abstract readonly type: ChannelType;
  abstract readonly capabilities: ChannelCapabilities;
  protected logger: LoggerHandle;
  protected connected = false;
  protected messageBuffer: ChannelMessage[] = [];

  constructor(logger: LoggerHandle) {
    super();
    this.logger = logger;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendMessage(recipientId: string, content: string, metadata?: Record<string, unknown>): Promise<ChannelMessage>;

  isConnected(): boolean { return this.connected; }

  getRecentMessages(limit: number = 50): ChannelMessage[] {
    return this.messageBuffer.slice(-limit);
  }

  protected bufferMessage(msg: ChannelMessage): void {
    this.messageBuffer.push(msg);
    if (this.messageBuffer.length > 500) this.messageBuffer = this.messageBuffer.slice(-250);
    this.emit('message', msg);
  }
}
