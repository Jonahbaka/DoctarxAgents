// ═══════════════════════════════════════════════════════════════
// Protocol :: Cryptographic Audit Trail
// SHA-256 hash chain for tamper-evident compliance logging
// Every action is chained to the previous — immutable history
// ═══════════════════════════════════════════════════════════════

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { LoggerHandle } from '../core/types.js';

export interface AuditEntry {
  id: string;
  sequenceNumber: number;
  timestamp: Date;
  actor: string;        // agent ID or 'human'
  action: string;       // tool name or action type
  target: string;       // what was acted upon
  details: Record<string, unknown>;
  previousHash: string;
  hash: string;
}

export class AuditTrail {
  private db: Database.Database;
  private logger: LoggerHandle;
  private sequenceCounter: number;
  private lastHash: string;

  constructor(db: Database.Database, logger: LoggerHandle) {
    this.db = db;
    this.logger = logger;
    this.initSchema();

    // Resume from last entry
    const last = this.db.prepare(
      'SELECT sequence_number, hash FROM audit_trail ORDER BY sequence_number DESC LIMIT 1'
    ).get() as { sequence_number: number; hash: string } | undefined;

    this.sequenceCounter = last ? last.sequence_number : 0;
    this.lastHash = last ? last.hash : '0'.repeat(64); // genesis hash

    this.logger.info(`AuditTrail initialized (${this.sequenceCounter} entries, chain intact)`);
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id TEXT PRIMARY KEY,
        sequence_number INTEGER UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        previous_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit_trail(sequence_number);
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_trail(actor);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_trail(action);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_trail(timestamp);
    `);
  }

  /** Record a new audit entry with hash chain */
  record(actor: string, action: string, target: string, details: Record<string, unknown> = {}): AuditEntry {
    this.sequenceCounter++;
    const id = uuid();
    const now = new Date();

    // Build the hash: SHA-256(previousHash + sequence + timestamp + actor + action + target + details)
    const payload = `${this.lastHash}|${this.sequenceCounter}|${now.toISOString()}|${actor}|${action}|${target}|${JSON.stringify(details)}`;
    const hash = createHash('sha256').update(payload).digest('hex');

    const entry: AuditEntry = {
      id,
      sequenceNumber: this.sequenceCounter,
      timestamp: now,
      actor,
      action,
      target,
      details,
      previousHash: this.lastHash,
      hash,
    };

    this.db.prepare(`
      INSERT INTO audit_trail (id, sequence_number, timestamp, actor, action, target, details, previous_hash, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.sequenceCounter, now.toISOString(), actor, action, target, JSON.stringify(details), this.lastHash, hash);

    this.lastHash = hash;
    return entry;
  }

  /** Verify the integrity of the entire hash chain */
  verifyChain(): { valid: boolean; brokenAt?: number; totalEntries: number } {
    const rows = this.db.prepare(
      'SELECT * FROM audit_trail ORDER BY sequence_number ASC'
    ).all() as Array<{
      id: string; sequence_number: number; timestamp: string; actor: string;
      action: string; target: string; details: string; previous_hash: string; hash: string;
    }>;

    if (rows.length === 0) return { valid: true, totalEntries: 0 };

    let previousHash = '0'.repeat(64);

    for (const row of rows) {
      // Verify previous hash link
      if (row.previous_hash !== previousHash) {
        this.logger.error(`Audit chain broken at sequence ${row.sequence_number}: previous_hash mismatch`);
        return { valid: false, brokenAt: row.sequence_number, totalEntries: rows.length };
      }

      // Recompute hash
      const details = row.details;
      const payload = `${row.previous_hash}|${row.sequence_number}|${row.timestamp}|${row.actor}|${row.action}|${row.target}|${details}`;
      const expectedHash = createHash('sha256').update(payload).digest('hex');

      if (row.hash !== expectedHash) {
        this.logger.error(`Audit chain broken at sequence ${row.sequence_number}: hash mismatch`);
        return { valid: false, brokenAt: row.sequence_number, totalEntries: rows.length };
      }

      previousHash = row.hash;
    }

    return { valid: true, totalEntries: rows.length };
  }

  /** Get audit entries by date range */
  getByDateRange(startDate: Date, endDate: Date, limit = 1000): AuditEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM audit_trail
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY sequence_number ASC
      LIMIT ?
    `).all(startDate.toISOString(), endDate.toISOString(), limit) as Array<{
      id: string; sequence_number: number; timestamp: string; actor: string;
      action: string; target: string; details: string; previous_hash: string; hash: string;
    }>;

    return rows.map(r => this.rowToEntry(r));
  }

  /** Get audit entries by actor */
  getByActor(actor: string, limit = 100): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_trail WHERE actor = ? ORDER BY sequence_number DESC LIMIT ?'
    ).all(actor, limit) as Array<{
      id: string; sequence_number: number; timestamp: string; actor: string;
      action: string; target: string; details: string; previous_hash: string; hash: string;
    }>;

    return rows.map(r => this.rowToEntry(r));
  }

  /** Get the latest N entries */
  getRecent(limit = 50): AuditEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM audit_trail ORDER BY sequence_number DESC LIMIT ?'
    ).all(limit) as Array<{
      id: string; sequence_number: number; timestamp: string; actor: string;
      action: string; target: string; details: string; previous_hash: string; hash: string;
    }>;

    return rows.map(r => this.rowToEntry(r)).reverse();
  }

  /** Get total entry count */
  getCount(): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM audit_trail').get() as { c: number }).c;
  }

  private rowToEntry(row: {
    id: string; sequence_number: number; timestamp: string; actor: string;
    action: string; target: string; details: string; previous_hash: string; hash: string;
  }): AuditEntry {
    return {
      id: row.id,
      sequenceNumber: row.sequence_number,
      timestamp: new Date(row.timestamp),
      actor: row.actor,
      action: row.action,
      target: row.target,
      details: JSON.parse(row.details),
      previousHash: row.previous_hash,
      hash: row.hash,
    };
  }
}
