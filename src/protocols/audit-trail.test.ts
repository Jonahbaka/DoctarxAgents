import { describe, it, expect, beforeEach } from 'vitest';
import { AuditTrail } from './audit-trail.js';
import { createTestDb, createMockLogger } from '../test-utils/mocks.js';
import type Database from 'better-sqlite3';

describe('AuditTrail', () => {
  let db: Database.Database;
  let trail: AuditTrail;

  beforeEach(() => {
    db = createTestDb();
    trail = new AuditTrail(db, createMockLogger());
  });

  it('should record an entry and increment count', () => {
    expect(trail.getCount()).toBe(0);
    trail.record('agent-1', 'tool_invoked', 'patient-123', { tool: 'fhir_lookup' });
    expect(trail.getCount()).toBe(1);
  });

  it('should create valid hash chain', () => {
    trail.record('system', 'boot', 'doctarx', { version: '6.0.0' });
    trail.record('agent-1', 'task_start', 'task-1', {});
    trail.record('agent-2', 'tool_invoke', 'search', { query: 'test' });

    const result = trail.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
  });

  it('should detect tampered entries', () => {
    trail.record('system', 'boot', 'doctarx', {});
    trail.record('agent-1', 'action', 'target', {});

    // Tamper with an entry
    db.prepare('UPDATE audit_trail SET action = ? WHERE sequence_number = 1').run('tampered');

    const result = trail.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it('should filter by actor', () => {
    trail.record('agent-1', 'action-a', 'target', {});
    trail.record('agent-2', 'action-b', 'target', {});
    trail.record('agent-1', 'action-c', 'target', {});

    const entries = trail.getByActor('agent-1', 100);
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.actor === 'agent-1')).toBe(true);
  });

  it('should filter by date range', () => {
    const before = new Date('2025-01-01');
    trail.record('system', 'action', 'target', {});
    const after = new Date('2030-12-31');

    const entries = trail.getByDateRange(before, after, 100);
    expect(entries).toHaveLength(1);
  });

  it('should return recent entries in chronological order', () => {
    trail.record('a', 'first', 'x', {});
    trail.record('b', 'second', 'y', {});
    trail.record('c', 'third', 'z', {});

    const recent = trail.getRecent(2);
    expect(recent).toHaveLength(2);
    // getRecent reverses DESC order, so first entry should have lower sequence
    expect(recent[0].action).toBe('second');
    expect(recent[1].action).toBe('third');
  });

  it('should verify empty chain as valid', () => {
    const result = trail.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it('should chain hashes correctly across entries', () => {
    const entry1 = trail.record('sys', 'boot', 'app', {});
    const entry2 = trail.record('sys', 'ready', 'app', {});

    expect(entry2.previousHash).toBe(entry1.hash);
    expect(entry1.previousHash).toBe('0'.repeat(64));
  });
});
