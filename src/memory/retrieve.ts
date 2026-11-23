import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';

export interface ConversationResult {
  id: number; role: 'user' | 'agent'; agentName: string | null; content: string; timestamp: string;
  sessionId: number | null; distance: number;
}
export interface DecisionResult {
  id: number; projectId: number | null; decision: string; rationale: string; madeBy: string | null; timestamp: string; distance: number;
}
export interface SkillResult {
  id: number; name: string; category: string | null; content: string; proficiency: number; lastUsed: string | null; distance: number;
}
export type MemoryCategory = 'conversation' | 'decision' | 'skill';
export interface UnifiedMemoryResult {
  category: MemoryCategory; id: number; content: string; distance: number;
}

// ══════════════════════════════════════════════════════
// أدوات مساعدة
// ══════════════════════════════════════════════════════

function assertEmbedding(vec: number[], ctx: string): void {
  if (!Array.isArray(vec) || vec.length !== 768) throw new Error(`${ctx}: expected 768-dim, got ${vec.length}`);
}
function toVecJson(vec: number[]): string { return JSON.stringify(vec); }

// ══════════════════════════════════════════════════════
// بحث المحادثات
// ══════════════════════════════════════════════════════

/** خيارات فلترة المحادثات؛ غيابها = البحث العالمي (السلوك القديم). */
export interface ConversationQueryOptions {
  /** رقم المشروع؛ `null` = الوضع اليومي (بلا جلسة أو جلسة بلا مشروع). */
  readonly projectId?: number | null;
  /** جلسة محددة؛ تُطبَّق مع فلتر المشروع بـ AND إن وُجد. */
  readonly sessionId?: number;
}

interface ConversationRow {
  id: number;
  role: 'user' | 'agent';
  agentName: string | null;
  content: string;
  timestamp: string;
  sessionId: number | null;
  distance: number;
}

const OVERFETCH_FACTOR = 10;
const MIN_OVERFETCH = 50;

function buildConversationFilter(
  options: ConversationQueryOptions,
): { sql: string; params: number[] } {
  const clauses: string[] = [];
  const params: number[] = [];

  if (options.sessionId !== undefined) {
    clauses.push('c.session_id = ?');
    params.push(options.sessionId);
  }

  if (options.projectId !== undefined) {
    if (options.projectId === null) {
      clauses.push('(c.session_id IS NULL OR s.project_id IS NULL)');
    } else {
      clauses.push('s.project_id = ?');
      params.push(options.projectId);
    }
  }

  return {
    sql: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export function retrieveConversations(
  db: Database.Database,
  q: number[],
  lim = 5,
  options: ConversationQueryOptions = {},
): ConversationResult[] {
  assertEmbedding(q, 'retrieveConversations');

  const safeLim = Math.max(1, Math.trunc(lim));
  const filter = buildConversationFilter(options);
  const filtered = filter.sql.length > 0;
  // فلترة ما بعد KNN تتطلب over-fetch، وإلا فقد يعود المشروع الصغير فارغًا.
  const knnLimit = filtered
    ? Math.max(safeLim * OVERFETCH_FACTOR, MIN_OVERFETCH)
    : safeLim;

  const rows = db.prepare<unknown[], ConversationRow>(`
    WITH knn AS (
      SELECT conversation_id AS id, distance
      FROM conversations_vec
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    )
    SELECT c.id, c.role, c.agent_name AS agentName, c.content, c.timestamp,
           c.session_id AS sessionId, knn.distance
    FROM knn
    JOIN conversations c ON c.id = knn.id
    LEFT JOIN sessions s ON s.id = c.session_id${filter.sql}
    ORDER BY knn.distance
    LIMIT ?
  `).all(toVecJson(q), knnLimit, ...filter.params, safeLim);

  log.info('Retrieved conversations', { count: rows.length, filtered });
  return rows;
}

// ══════════════════════════════════════════════════════
// بحث القرارات
// ══════════════════════════════════════════════════════

export function retrieveDecisions(
  db: Database.Database, q: number[], lim = 5,
): DecisionResult[] {
  assertEmbedding(q, 'retrieveDecisions');
  const r = db.prepare(`WITH knn AS (SELECT decision_id AS id, distance FROM decisions_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?) SELECT d.id, d.project_id AS projectId, d.decision, d.rationale, d.made_by AS madeBy, d.timestamp, knn.distance FROM knn JOIN decisions d ON d.id = knn.id ORDER BY knn.distance`).all(toVecJson(q), lim) as Array<{id: number; projectId: number | null; decision: string; rationale: string; madeBy: string | null; timestamp: string; distance: number}>;
  log.info('Retrieved decisions', { count: r.length });
  return r;
}

// ══════════════════════════════════════════════════════
// بحث المهارات
// ══════════════════════════════════════════════════════

export function retrieveSkills(
  db: Database.Database, q: number[], lim = 5,
): SkillResult[] {
  assertEmbedding(q, 'retrieveSkills');
  const r = db.prepare(`WITH knn AS (SELECT skill_id AS id, distance FROM skills_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?) SELECT s.id, s.name, s.category, s.content, s.proficiency, s.last_used AS lastUsed, knn.distance FROM knn JOIN skills s ON s.id = knn.id ORDER BY knn.distance`).all(toVecJson(q), lim) as Array<{id: number; name: string; category: string | null; content: string; proficiency: number; lastUsed: string | null; distance: number}>;
  log.info('Retrieved skills', { count: r.length });
  return r;
}

// ══════════════════════════════════════════════════════
// بحث موحّد
// ══════════════════════════════════════════════════════

export function retrieveUnified(
  db: Database.Database, q: number[], lim = 10,
  conversationOptions: ConversationQueryOptions = {},
): UnifiedMemoryResult[] {
  assertEmbedding(q, 'retrieveUnified');
  const c = retrieveConversations(db, q, lim, conversationOptions);
  const d = retrieveDecisions(db, q, lim);
  const s = retrieveSkills(db, q, lim);
  const m: UnifiedMemoryResult[] = [
    ...c.map((x: ConversationResult) => ({ category: 'conversation' as const, id: x.id, content: x.content, distance: x.distance })),
    ...d.map((x: DecisionResult) => ({ category: 'decision' as const, id: x.id, content: `${x.decision}: ${x.rationale}`, distance: x.distance })),
    ...s.map((x: SkillResult) => ({ category: 'skill' as const, id: x.id, content: x.content, distance: x.distance })),
  ];
  m.sort((a: UnifiedMemoryResult, b: UnifiedMemoryResult) => a.distance - b.distance);
  return m.slice(0, lim);
}