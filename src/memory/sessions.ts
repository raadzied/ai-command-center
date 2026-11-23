import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';

export interface SessionRecord {
  readonly id: number;
  readonly projectId: number | null;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SessionMessage {
  readonly id: number;
  readonly role: 'user' | 'agent';
  readonly agentName: string | null;
  readonly content: string;
  readonly timestamp: string;
}

interface SessionRow {
  readonly id: number;
  readonly projectId: number | null;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface MessageRow {
  readonly id: number;
  readonly role: 'user' | 'agent';
  readonly agentName: string | null;
  readonly content: string;
  readonly timestamp: string;
}

export const DEFAULT_SESSION_TITLE = 'New session';

const MAX_TITLE_LENGTH = 120;
const MAX_LIST_LIMIT = 200;
const MAX_MESSAGE_LIMIT = 200;

const SESSION_COLUMNS = `id, project_id AS projectId, title,
  created_at AS createdAt, updated_at AS updatedAt`;

/** يوحّد المسافات ويقصّ الطول دون قطع surrogate pairs. */
export function sanitizeSessionTitle(value: string): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return DEFAULT_SESSION_TITLE;

  const chars = Array.from(collapsed);
  return chars.length <= MAX_TITLE_LENGTH
    ? collapsed
    : chars.slice(0, MAX_TITLE_LENGTH).join('');
}

/** ينشئ جلسة لمشروع، أو جلسة وضع يومي عندما projectId = null. */
export function createSession(
  db: Database.Database,
  projectId: number | null,
  title: string = DEFAULT_SESSION_TITLE,
): number {
  if (projectId !== null) {
    const project = db
      .prepare<[number], { present: number }>(
        'SELECT 1 AS present FROM projects WHERE id = ?',
      )
      .get(projectId);
    if (project === undefined) {
      throw new Error(`Cannot create session: project ${projectId} does not exist`);
    }
  }

  const info = db
    .prepare<[number | null, string]>(
      'INSERT INTO sessions (project_id, title) VALUES (?, ?)',
    )
    .run(projectId, sanitizeSessionTitle(title));

  const id = Number(info.lastInsertRowid);
  log.info('Created session', { id, projectId });
  return id;
}

export function getSession(db: Database.Database, id: number): SessionRecord | null {
  const row = db
    .prepare<[number], SessionRow>(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = ?`)
    .get(id);
  return row === undefined ? null : row;
}

export function listProjectSessions(
  db: Database.Database,
  projectId: number | null,
  limit = 50,
): SessionRecord[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_LIST_LIMIT));
  if (projectId === null) {
    return db
      .prepare<[number], SessionRow>(
        `SELECT ${SESSION_COLUMNS} FROM sessions
         WHERE project_id IS NULL
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
      )
      .all(safeLimit);
  }
  return db
    .prepare<[number, number], SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM sessions
       WHERE project_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
    .all(projectId, safeLimit);
}

export function renameSession(
  db: Database.Database,
  id: number,
  title: string,
): void {
  const info = db
    .prepare<[string, number]>('UPDATE sessions SET title = ? WHERE id = ?')
    .run(sanitizeSessionTitle(title), id);
  if (info.changes === 0) {
    throw new Error('Session not found: ' + String(id));
  }
}

/** يحذف الجلسة ورسائلها ومتجهاتها في معاملة واحدة. يعيد true إن حُذفت. */
export function deleteSession(db: Database.Database, sessionId: number): boolean {
  const run = db.transaction((id: number): boolean => {
    db.prepare<[number]>(
      `DELETE FROM conversations_vec WHERE conversation_id IN
       (SELECT id FROM conversations WHERE session_id = ?)`,
    ).run(id);
    db.prepare<[number]>('DELETE FROM conversations WHERE session_id = ?').run(id);
    const info = db.prepare<[number]>('DELETE FROM sessions WHERE id = ?').run(id);
    return info.changes > 0;
  });
  return run(sessionId);
}

/** يحدّث updated_at بعد حفظ رسائل الجلسة. */
export function touchSession(db: Database.Database, id: number): void {
  const info = db
    .prepare<[number]>('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(id);
  if (info.changes === 0) {
    throw new Error('Session not found: ' + String(id));
  }
}

/** آخر N رسالة بترتيب زمني تصاعدي (الأقدم أولًا) — جاهزة لسياق المحادثة. */
export function getRecentSessionMessages(
  db: Database.Database,
  sessionId: number,
  limit = 10,
): SessionMessage[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_MESSAGE_LIMIT));
  const rows = db
    .prepare<[number, number], MessageRow>(
      `SELECT id, role, agent_name AS agentName, content, timestamp
       FROM conversations
       WHERE session_id = ?
       ORDER BY id DESC LIMIT ?`,
    )
    .all(sessionId, safeLimit);
  return rows.reverse();
}
