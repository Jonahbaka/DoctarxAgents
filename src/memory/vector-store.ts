// ═══════════════════════════════════════════════════════════════
// DoctarxAgents :: Memory Subsystem
// SQLite-backed vector store with episodic/semantic/procedural layers
// EHR + CRM data fusion — credit score as vital sign
// ═══════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import { MemoryEntry, MemoryHandle, PatientRecord, LoggerHandle } from '../core/types.js';
import { CONFIG } from '../core/config.js';

// ── Cosine Similarity (pure TS, no native deps) ──

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Simple text hashing for lightweight deduplication ──

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// ── Embedding Provider ──

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimensions: number;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  dimensions = 128;

  // Lightweight local embedding using character-level n-gram hashing
  // For production, swap with OpenAI text-embedding-3-small
  async embed(text: string): Promise<number[]> {
    const vec = new Float64Array(this.dimensions);
    const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const words = normalized.split(/\s+/);

    for (const word of words) {
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= word.length - n; i++) {
          const gram = word.slice(i, i + n);
          let h = 0;
          for (let j = 0; j < gram.length; j++) {
            h = ((h << 5) - h + gram.charCodeAt(j)) | 0;
          }
          const idx = Math.abs(h) % this.dimensions;
          vec[idx] += 1.0 / (n * words.length);
        }
      }
    }

    // L2 normalize
    let mag = 0;
    for (let i = 0; i < this.dimensions; i++) mag += vec[i] * vec[i];
    mag = Math.sqrt(mag);
    if (mag > 0) for (let i = 0; i < this.dimensions; i++) vec[i] /= mag;

    return Array.from(vec);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  dimensions = 1536;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<number[]> {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CONFIG.openai.embeddingModel,
        input: text,
      }),
    });

    if (!resp.ok) throw new Error(`OpenAI embedding failed: ${resp.status}`);
    const data = await resp.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }
}

// ── Vector Store ──

export class VectorStore extends EventEmitter {
  private db: Database.Database;
  private embedder: EmbeddingProvider;
  private logger: LoggerHandle;

  constructor(logger: LoggerHandle, embedder?: EmbeddingProvider) {
    super();
    this.logger = logger;

    // Use OpenAI embeddings if key available, otherwise local
    if (CONFIG.openai.apiKey) {
      this.embedder = embedder || new OpenAIEmbeddingProvider(CONFIG.openai.apiKey);
    } else {
      this.embedder = embedder || new LocalEmbeddingProvider();
    }

    this.db = new Database(CONFIG.database.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
    this.logger.info('VectorStore initialized', { dbPath: CONFIG.database.path });
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('episodic', 'semantic', 'procedural', 'working')),
        namespace TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB,
        metadata TEXT DEFAULT '{}',
        importance REAL DEFAULT 0.5,
        created_at TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories(namespace);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);

      CREATE TABLE IF NOT EXISTS patients (
        patient_id TEXT PRIMARY KEY,
        mrn TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);

      CREATE TABLE IF NOT EXISTS execution_log (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        action TEXT NOT NULL,
        input TEXT,
        output TEXT,
        tokens_used INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        timestamp TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_exec_agent ON execution_log(agent_id);
      CREATE INDEX IF NOT EXISTS idx_exec_timestamp ON execution_log(timestamp DESC);

      CREATE TABLE IF NOT EXISTS self_evaluations (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        metrics TEXT NOT NULL,
        analysis TEXT NOT NULL,
        recommendations TEXT NOT NULL,
        routing_changes TEXT NOT NULL,
        applied INTEGER DEFAULT 0
      );
    `);
  }

  // ── Memory Handle Factory ──

  createMemoryHandle(agentId: string): MemoryHandle {
    return {
      store: (entry) => this.storeMemory({ ...entry, agentId }),
      recall: (query, namespace, limit) => this.recallMemory(agentId, query, namespace, limit),
      forget: (id) => this.forgetMemory(id),
      consolidate: () => this.consolidateMemory(agentId),
    };
  }

  // ── Store ──

  async storeMemory(entry: {
    agentId: string;
    type: MemoryEntry['type'];
    namespace: string;
    content: string;
    metadata: Record<string, unknown>;
    importance: number;
    embedding?: number[];
  }): Promise<string> {
    const id = uuid();
    const now = new Date().toISOString();
    const contentHash = hashText(entry.content);

    // Dedup: skip if identical content already stored for this agent+namespace
    const existing = this.db.prepare(
      'SELECT id FROM memories WHERE agent_id = ? AND namespace = ? AND content_hash = ?'
    ).get(entry.agentId, entry.namespace, contentHash) as { id: string } | undefined;

    if (existing) {
      // Bump access count instead
      this.db.prepare('UPDATE memories SET access_count = access_count + 1, accessed_at = ? WHERE id = ?')
        .run(now, existing.id);
      return existing.id;
    }

    // Generate embedding
    const embedding = entry.embedding || await this.embedder.embed(entry.content);
    const embeddingBlob = Buffer.from(new Float64Array(embedding).buffer);

    this.db.prepare(`
      INSERT INTO memories (id, agent_id, type, namespace, content, content_hash, embedding, metadata, importance, created_at, accessed_at, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id, entry.agentId, entry.type, entry.namespace,
      entry.content, contentHash, embeddingBlob,
      JSON.stringify(entry.metadata), entry.importance, now, now
    );

    this.emit('memory:stored', { id, agentId: entry.agentId, namespace: entry.namespace });
    this.logger.debug(`Memory stored: ${id} [${entry.type}/${entry.namespace}]`);
    return id;
  }

  // ── Recall (semantic search) ──

  async recallMemory(
    agentId: string,
    query: string,
    namespace?: string,
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    const queryEmbedding = await this.embedder.embed(query);
    const now = new Date().toISOString();

    // Fetch candidate memories
    let sql = 'SELECT * FROM memories WHERE agent_id = ?';
    const params: unknown[] = [agentId];

    if (namespace) {
      sql += ' AND namespace = ?';
      params.push(namespace);
    }

    sql += ' ORDER BY importance DESC LIMIT 200'; // fetch top 200 by importance, then rank by similarity

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      agent_id: string;
      type: string;
      namespace: string;
      content: string;
      embedding: Buffer | null;
      metadata: string;
      importance: number;
      created_at: string;
      accessed_at: string;
      access_count: number;
    }>;

    // Score by semantic similarity + importance + recency
    const scored = rows.map(row => {
      let similarity = 0;
      if (row.embedding) {
        const stored = Array.from(new Float64Array(row.embedding.buffer.slice(
          row.embedding.byteOffset,
          row.embedding.byteOffset + row.embedding.byteLength
        )));
        similarity = cosineSimilarity(queryEmbedding, stored);
      }

      const ageHours = (Date.now() - new Date(row.accessed_at).getTime()) / 3600000;
      const recencyBoost = Math.exp(-ageHours / 168); // decay over ~1 week

      const score = (similarity * 0.6) + (row.importance * 0.25) + (recencyBoost * 0.15);

      return { row, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const results = scored.slice(0, limit).map(({ row }) => {
      // Update access tracking
      this.db.prepare('UPDATE memories SET access_count = access_count + 1, accessed_at = ? WHERE id = ?')
        .run(now, row.id);

      return {
        id: row.id,
        agentId: row.agent_id,
        type: row.type as MemoryEntry['type'],
        namespace: row.namespace,
        content: row.content,
        metadata: JSON.parse(row.metadata),
        importance: row.importance,
        createdAt: new Date(row.created_at),
        accessedAt: new Date(now),
        accessCount: row.access_count + 1,
      };
    });

    this.emit('memory:recalled', { agentId, query, results: results.length });
    return results;
  }

  // ── Forget ──

  async forgetMemory(id: string): Promise<void> {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    this.logger.debug(`Memory forgotten: ${id}`);
  }

  // ── Consolidate (merge similar, prune stale) ──

  async consolidateMemory(agentId: string): Promise<number> {
    const threshold = 0.1; // importance threshold for pruning
    const maxAge = 30 * 24 * 3600000; // 30 days

    const cutoff = new Date(Date.now() - maxAge).toISOString();

    // Prune low-importance, old, rarely-accessed memories
    const result = this.db.prepare(`
      DELETE FROM memories
      WHERE agent_id = ?
        AND importance < ?
        AND accessed_at < ?
        AND access_count < 3
        AND type != 'procedural'
    `).run(agentId, threshold, cutoff);

    this.logger.info(`Memory consolidation: pruned ${result.changes} entries for ${agentId}`);
    return result.changes;
  }

  // ── Patient Record Store (EHR/CRM Fusion) ──

  upsertPatient(record: PatientRecord): void {
    this.db.prepare(`
      INSERT INTO patients (patient_id, mrn, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(patient_id) DO UPDATE SET data = ?, updated_at = ?
    `).run(
      record.patientId, record.mrn,
      JSON.stringify(record), new Date().toISOString(),
      JSON.stringify(record), new Date().toISOString()
    );
  }

  getPatient(patientId: string): PatientRecord | null {
    const row = this.db.prepare('SELECT data FROM patients WHERE patient_id = ?')
      .get(patientId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }

  searchPatients(query: string): PatientRecord[] {
    const rows = this.db.prepare(`
      SELECT data FROM patients
      WHERE data LIKE ?
      LIMIT 50
    `).all(`%${query}%`) as Array<{ data: string }>;
    return rows.map(r => JSON.parse(r.data));
  }

  // ── Execution Log ──

  logExecution(entry: {
    agentId: string;
    taskId?: string;
    action: string;
    input?: unknown;
    output?: unknown;
    tokensUsed?: number;
    durationMs?: number;
    success?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO execution_log (id, agent_id, task_id, action, input, output, tokens_used, duration_ms, success, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(), entry.agentId, entry.taskId || null,
      entry.action,
      entry.input ? JSON.stringify(entry.input) : null,
      entry.output ? JSON.stringify(entry.output) : null,
      entry.tokensUsed || 0, entry.durationMs || 0,
      entry.success !== false ? 1 : 0,
      new Date().toISOString()
    );
  }

  getExecutionLog(agentId?: string, limit: number = 100): Array<Record<string, unknown>> {
    let sql = 'SELECT * FROM execution_log';
    const params: unknown[] = [];

    if (agentId) {
      sql += ' WHERE agent_id = ?';
      params.push(agentId);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  }

  // ── Self-Evaluation Storage ──

  storeSelfEvaluation(eval_: {
    id: string;
    timestamp: Date;
    periodStart: Date;
    periodEnd: Date;
    metrics: Record<string, unknown>;
    analysis: string;
    recommendations: string[];
    routingChanges: Array<Record<string, unknown>>;
  }): void {
    this.db.prepare(`
      INSERT INTO self_evaluations (id, timestamp, period_start, period_end, metrics, analysis, recommendations, routing_changes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eval_.id, eval_.timestamp.toISOString(),
      eval_.periodStart.toISOString(), eval_.periodEnd.toISOString(),
      JSON.stringify(eval_.metrics), eval_.analysis,
      JSON.stringify(eval_.recommendations), JSON.stringify(eval_.routingChanges)
    );
  }

  getSelfEvaluations(limit: number = 10): Array<Record<string, unknown>> {
    return this.db.prepare('SELECT * FROM self_evaluations ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as Array<Record<string, unknown>>;
  }

  // ── Stats ──

  getStats(): Record<string, number> {
    const memCount = (this.db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
    const patientCount = (this.db.prepare('SELECT COUNT(*) as c FROM patients').get() as { c: number }).c;
    const execCount = (this.db.prepare('SELECT COUNT(*) as c FROM execution_log').get() as { c: number }).c;
    const evalCount = (this.db.prepare('SELECT COUNT(*) as c FROM self_evaluations').get() as { c: number }).c;

    return { memories: memCount, patients: patientCount, executions: execCount, evaluations: evalCount };
  }

  /** Expose underlying database for shared access (GraphStore, AuditTrail) */
  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
    this.logger.info('VectorStore closed');
  }
}
