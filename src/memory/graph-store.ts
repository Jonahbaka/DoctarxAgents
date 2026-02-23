// ═══════════════════════════════════════════════════════════════
// Memory :: Knowledge Graph Store
// Entities + relationships alongside the vector store
// Enables relational reasoning: "which patients are on this med?"
// ═══════════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { LoggerHandle } from '../core/types.js';

export interface GraphEntity {
  id: string;
  type: string;         // patient, provider, medication, condition, agent, tool, etc.
  name: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GraphRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: string; // prescribed_by, treats, monitors, depends_on, etc.
  weight: number;       // 0-1 strength of relationship
  properties: Record<string, unknown>;
  createdAt: Date;
}

export class GraphStore {
  private db: Database.Database;
  private logger: LoggerHandle;

  constructor(db: Database.Database, logger: LoggerHandle) {
    this.db = db;
    this.logger = logger;
    this.initSchema();
    this.logger.info('GraphStore initialized (knowledge graph layer)');
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_entities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        properties TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ge_type ON graph_entities(type);
      CREATE INDEX IF NOT EXISTS idx_ge_name ON graph_entities(name);

      CREATE TABLE IF NOT EXISTS graph_relationships (
        id TEXT PRIMARY KEY,
        from_entity_id TEXT NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
        to_entity_id TEXT NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
        relation_type TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        properties TEXT DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_gr_from ON graph_relationships(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_gr_to ON graph_relationships(to_entity_id);
      CREATE INDEX IF NOT EXISTS idx_gr_type ON graph_relationships(relation_type);
      CREATE INDEX IF NOT EXISTS idx_gr_pair ON graph_relationships(from_entity_id, to_entity_id);
    `);
  }

  // ── Entity Operations ─────────────────────────────────────

  createEntity(type: string, name: string, properties: Record<string, unknown> = {}): GraphEntity {
    const id = uuid();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO graph_entities (id, type, name, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, type, name, JSON.stringify(properties), now.toISOString(), now.toISOString());

    this.logger.debug(`Graph entity created: ${type}/${name} [${id}]`);
    return { id, type, name, properties, createdAt: now, updatedAt: now };
  }

  updateEntity(id: string, updates: { name?: string; properties?: Record<string, unknown> }): boolean {
    const existing = this.getEntity(id);
    if (!existing) return false;

    const now = new Date().toISOString();
    const name = updates.name ?? existing.name;
    const properties = updates.properties
      ? JSON.stringify({ ...existing.properties, ...updates.properties })
      : JSON.stringify(existing.properties);

    this.db.prepare('UPDATE graph_entities SET name = ?, properties = ?, updated_at = ? WHERE id = ?')
      .run(name, properties, now, id);
    return true;
  }

  getEntity(id: string): GraphEntity | null {
    const row = this.db.prepare('SELECT * FROM graph_entities WHERE id = ?').get(id) as {
      id: string; type: string; name: string; properties: string; created_at: string; updated_at: string;
    } | undefined;
    return row ? this.rowToEntity(row) : null;
  }

  deleteEntity(id: string): boolean {
    const result = this.db.prepare('DELETE FROM graph_entities WHERE id = ?').run(id);
    return result.changes > 0;
  }

  searchEntities(query: string, type?: string, limit = 50): GraphEntity[] {
    let sql = 'SELECT * FROM graph_entities WHERE name LIKE ?';
    const params: unknown[] = [`%${query}%`];

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string; type: string; name: string; properties: string; created_at: string; updated_at: string;
    }>;
    return rows.map(r => this.rowToEntity(r));
  }

  getEntitiesByType(type: string, limit = 100): GraphEntity[] {
    const rows = this.db.prepare(
      'SELECT * FROM graph_entities WHERE type = ? ORDER BY updated_at DESC LIMIT ?'
    ).all(type, limit) as Array<{
      id: string; type: string; name: string; properties: string; created_at: string; updated_at: string;
    }>;
    return rows.map(r => this.rowToEntity(r));
  }

  // ── Relationship Operations ───────────────────────────────

  createRelationship(
    fromEntityId: string, toEntityId: string,
    relationType: string, weight = 1.0,
    properties: Record<string, unknown> = {}
  ): GraphRelationship {
    const id = uuid();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO graph_relationships (id, from_entity_id, to_entity_id, relation_type, weight, properties, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, fromEntityId, toEntityId, relationType, weight, JSON.stringify(properties), now.toISOString());

    this.logger.debug(`Graph relationship: ${fromEntityId} --[${relationType}]--> ${toEntityId}`);
    return { id, fromEntityId, toEntityId, relationType, weight, properties, createdAt: now };
  }

  deleteRelationship(id: string): boolean {
    const result = this.db.prepare('DELETE FROM graph_relationships WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /** Get all relationships from an entity */
  getOutgoing(entityId: string, relationType?: string): GraphRelationship[] {
    let sql = 'SELECT * FROM graph_relationships WHERE from_entity_id = ?';
    const params: unknown[] = [entityId];

    if (relationType) {
      sql += ' AND relation_type = ?';
      params.push(relationType);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string; from_entity_id: string; to_entity_id: string;
      relation_type: string; weight: number; properties: string; created_at: string;
    }>;
    return rows.map(r => this.rowToRelationship(r));
  }

  /** Get all relationships to an entity */
  getIncoming(entityId: string, relationType?: string): GraphRelationship[] {
    let sql = 'SELECT * FROM graph_relationships WHERE to_entity_id = ?';
    const params: unknown[] = [entityId];

    if (relationType) {
      sql += ' AND relation_type = ?';
      params.push(relationType);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string; from_entity_id: string; to_entity_id: string;
      relation_type: string; weight: number; properties: string; created_at: string;
    }>;
    return rows.map(r => this.rowToRelationship(r));
  }

  /** Query all relationships of a given type */
  queryRelationships(relationType: string, limit = 100): Array<{ from: GraphEntity; to: GraphEntity; relationship: GraphRelationship }> {
    const rows = this.db.prepare(`
      SELECT r.*, fe.id as fe_id, fe.type as fe_type, fe.name as fe_name, fe.properties as fe_props, fe.created_at as fe_created, fe.updated_at as fe_updated,
             te.id as te_id, te.type as te_type, te.name as te_name, te.properties as te_props, te.created_at as te_created, te.updated_at as te_updated
      FROM graph_relationships r
      JOIN graph_entities fe ON r.from_entity_id = fe.id
      JOIN graph_entities te ON r.to_entity_id = te.id
      WHERE r.relation_type = ?
      ORDER BY r.weight DESC
      LIMIT ?
    `).all(relationType, limit) as Array<Record<string, unknown>>;

    return rows.map(r => ({
      from: this.rowToEntity({
        id: r.fe_id as string, type: r.fe_type as string, name: r.fe_name as string,
        properties: r.fe_props as string, created_at: r.fe_created as string, updated_at: r.fe_updated as string,
      }),
      to: this.rowToEntity({
        id: r.te_id as string, type: r.te_type as string, name: r.te_name as string,
        properties: r.te_props as string, created_at: r.te_created as string, updated_at: r.te_updated as string,
      }),
      relationship: this.rowToRelationship({
        id: r.id as string, from_entity_id: r.from_entity_id as string,
        to_entity_id: r.to_entity_id as string, relation_type: r.relation_type as string,
        weight: r.weight as number, properties: r.properties as string, created_at: r.created_at as string,
      }),
    }));
  }

  /** BFS shortest path between two entities (max depth 6) */
  findPath(fromId: string, toId: string, maxDepth = 6): string[] | null {
    const visited = new Set<string>();
    const queue: Array<{ entityId: string; path: string[] }> = [{ entityId: fromId, path: [fromId] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.entityId === toId) return current.path;
      if (current.path.length > maxDepth) continue;
      if (visited.has(current.entityId)) continue;
      visited.add(current.entityId);

      // Get all connected entities
      const neighbors = this.db.prepare(
        'SELECT to_entity_id as eid FROM graph_relationships WHERE from_entity_id = ? UNION SELECT from_entity_id as eid FROM graph_relationships WHERE to_entity_id = ?'
      ).all(current.entityId, current.entityId) as Array<{ eid: string }>;

      for (const n of neighbors) {
        if (!visited.has(n.eid)) {
          queue.push({ entityId: n.eid, path: [...current.path, n.eid] });
        }
      }
    }

    return null;
  }

  // ── Stats ─────────────────────────────────────────────────

  getStats(): { entities: number; relationships: number; entityTypes: string[] } {
    const entities = (this.db.prepare('SELECT COUNT(*) as c FROM graph_entities').get() as { c: number }).c;
    const relationships = (this.db.prepare('SELECT COUNT(*) as c FROM graph_relationships').get() as { c: number }).c;
    const types = this.db.prepare('SELECT DISTINCT type FROM graph_entities').all() as Array<{ type: string }>;

    return { entities, relationships, entityTypes: types.map(t => t.type) };
  }

  // ── Row Converters ────────────────────────────────────────

  private rowToEntity(row: { id: string; type: string; name: string; properties: string; created_at: string; updated_at: string }): GraphEntity {
    return {
      id: row.id, type: row.type, name: row.name,
      properties: JSON.parse(row.properties),
      createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
    };
  }

  private rowToRelationship(row: { id: string; from_entity_id: string; to_entity_id: string; relation_type: string; weight: number; properties: string; created_at: string }): GraphRelationship {
    return {
      id: row.id, fromEntityId: row.from_entity_id, toEntityId: row.to_entity_id,
      relationType: row.relation_type, weight: row.weight,
      properties: JSON.parse(row.properties), createdAt: new Date(row.created_at),
    };
  }
}
