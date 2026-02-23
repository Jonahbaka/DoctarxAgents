// ═══════════════════════════════════════════════════════════════
// Protocol :: Agent-to-Agent (A2A) Communication
// Message queue for inter-agent coordination within the swarm
// ═══════════════════════════════════════════════════════════════

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import { A2AMessage, LoggerHandle } from '../core/types.js';

interface A2AEvents {
  'a2a:received': (msg: A2AMessage) => void;
  'a2a:broadcast': (msg: A2AMessage) => void;
  'a2a:expired': (msg: A2AMessage) => void;
}

export class A2AProtocol extends EventEmitter<A2AEvents> {
  private queues: Map<string, A2AMessage[]> = new Map();
  private acknowledged: Set<string> = new Set();
  private logger: LoggerHandle;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(logger: LoggerHandle) {
    super();
    this.logger = logger;
    // Purge expired messages every 60s
    this.cleanupTimer = setInterval(() => this.purgeExpired(), 60000);
  }

  /** Send a direct message from one agent to another */
  send(fromAgent: string, toAgent: string, payload: Record<string, unknown>, ttl = 300000): A2AMessage {
    const msg: A2AMessage = {
      id: uuid(),
      fromAgent,
      toAgent,
      type: 'request',
      payload,
      timestamp: new Date(),
      ttl,
    };

    if (!this.queues.has(toAgent)) this.queues.set(toAgent, []);
    this.queues.get(toAgent)!.push(msg);

    this.emit('a2a:received', msg);
    this.logger.debug(`A2A: ${fromAgent} → ${toAgent} [${msg.id}]`);
    return msg;
  }

  /** Respond to a specific message */
  respond(originalMsgId: string, fromAgent: string, payload: Record<string, unknown>, ttl = 300000): A2AMessage | null {
    // Find the original to get the sender
    for (const queue of this.queues.values()) {
      const original = queue.find(m => m.id === originalMsgId);
      if (original) {
        const response: A2AMessage = {
          id: uuid(),
          fromAgent,
          toAgent: original.fromAgent,
          type: 'response',
          payload: { ...payload, inReplyTo: originalMsgId },
          timestamp: new Date(),
          ttl,
        };

        if (!this.queues.has(original.fromAgent)) this.queues.set(original.fromAgent, []);
        this.queues.get(original.fromAgent)!.push(response);

        this.acknowledge(originalMsgId);
        this.logger.debug(`A2A response: ${fromAgent} → ${original.fromAgent} [re: ${originalMsgId}]`);
        return response;
      }
    }
    return null;
  }

  /** Broadcast to all agents */
  broadcast(fromAgent: string, payload: Record<string, unknown>, ttl = 300000): A2AMessage {
    const msg: A2AMessage = {
      id: uuid(),
      fromAgent,
      toAgent: '*',
      type: 'broadcast',
      payload,
      timestamp: new Date(),
      ttl,
    };

    // Add to all queues (except sender)
    for (const [agentId, queue] of this.queues) {
      if (agentId !== fromAgent) queue.push(msg);
    }

    this.emit('a2a:broadcast', msg);
    this.logger.debug(`A2A broadcast from ${fromAgent} [${msg.id}]`);
    return msg;
  }

  /** Receive pending messages for an agent (non-destructive peek) */
  receive(agentId: string, limit = 20): A2AMessage[] {
    const queue = this.queues.get(agentId) || [];
    const now = Date.now();

    return queue
      .filter(m => !this.acknowledged.has(m.id))
      .filter(m => now - m.timestamp.getTime() < m.ttl)
      .slice(0, limit);
  }

  /** Consume = receive + acknowledge all returned */
  consume(agentId: string, limit = 20): A2AMessage[] {
    const messages = this.receive(agentId, limit);
    messages.forEach(m => this.acknowledge(m.id));
    return messages;
  }

  /** Mark a message as processed */
  acknowledge(msgId: string): void {
    this.acknowledged.add(msgId);
  }

  /** Ensure an agent has a queue */
  registerAgent(agentId: string): void {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, []);
    }
  }

  /** Get queue depth for an agent */
  getQueueDepth(agentId: string): number {
    const queue = this.queues.get(agentId) || [];
    return queue.filter(m => !this.acknowledged.has(m.id)).length;
  }

  /** Get all registered agents */
  getRegisteredAgents(): string[] {
    return Array.from(this.queues.keys());
  }

  /** Purge expired messages and old acks */
  private purgeExpired(): void {
    const now = Date.now();
    let purged = 0;

    for (const [agentId, queue] of this.queues) {
      const before = queue.length;
      const active = queue.filter(m => {
        const expired = now - m.timestamp.getTime() >= m.ttl;
        if (expired) this.emit('a2a:expired', m);
        return !expired;
      });
      this.queues.set(agentId, active);
      purged += before - active.length;
    }

    // Prune acknowledged set (keep last 5000)
    if (this.acknowledged.size > 5000) {
      const arr = Array.from(this.acknowledged);
      this.acknowledged = new Set(arr.slice(-2500));
    }

    if (purged > 0) this.logger.debug(`A2A: purged ${purged} expired messages`);
  }

  /** Clean shutdown */
  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.queues.clear();
    this.acknowledged.clear();
  }
}
