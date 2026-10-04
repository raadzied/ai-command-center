import type Database from 'better-sqlite3';
import type {
  ClassifiedAction,
  ApprovalResult,
} from '../types.js';
import { getDb } from '../memory/db.js';
import { logger as log } from '../llm/logger.js';

// يضمن وجود جدول audit_log
export function ensureAuditSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      target TEXT NOT NULL,
      reason TEXT NOT NULL,
      risk TEXT NOT NULL,
      explanation TEXT NOT NULL,
      decision TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp
      ON audit_log(timestamp DESC);
  `);
}

// يكتب سجل مراجعة
export function writeAudit(
  action: ClassifiedAction,
  result: ApprovalResult,
): void {
  try {
    const db = getDb();
    ensureAuditSchema(db);

    db.prepare(
      `INSERT INTO audit_log
        (id, action_type, target, reason, risk, explanation, decision)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      result.auditId,
      action.type,
      action.target.slice(0, 500),
      action.reason.slice(0, 500),
      action.risk,
      action.explanation.slice(0, 500),
      result.decision,
    );
  } catch (err) {
    log.warn('Audit write failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// يقرأ آخر N سجل (لأمر /audit)
export function readRecentAudit(
  limit = 20,
): Array<{
  id: string;
  action_type: string;
  target: string;
  risk: string;
  decision: string;
  timestamp: string;
}> {
  const db = getDb();
  ensureAuditSchema(db);
  return db
    .prepare(
      `SELECT id, action_type, target, risk, decision, timestamp
       FROM audit_log
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    action_type: string;
    target: string;
    risk: string;
    decision: string;
    timestamp: string;
  }>;
}
