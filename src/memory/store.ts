import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';

export interface ConversationInput {
  role: 'user' | 'agent';
  agentName?: string;
  content: string;
  embedding?: number[];
}

export interface ProjectInput {
  name: string;
  requirements?: string;
  architecture?: string;
}

export interface DecisionInput {
  projectId?: number;
  decision: string;
  rationale: string;
  alternatives?: string;
  madeBy?: string;
  embedding?: number[];
}

export interface SkillInput {
  name: string;
  category: string;
  content: string;
  proficiency?: number;
  embedding?: number[];
}

function assertEmbedding(vec: number[], ctx: string): void {
  if (vec.length !== 768) throw new Error(`${ctx}: expected 768, got ${vec.length}`);
}

function toVecJson(vec: number[]): string {
  return JSON.stringify(vec);
}

export function saveConversation(
  db: Database.Database,
  i: ConversationInput,
): number {
  const tx = db.transaction((d: ConversationInput) => {
    const ri = db.prepare(`INSERT INTO conversations (role, agent_name, content) VALUES (?,?,?)`).run(d.role, d.agentName ?? null, d.content);
    const id = Number(ri.lastInsertRowid);
    if (d.embedding) { assertEmbedding(d.embedding, 'saveConversation');
      db.prepare(`INSERT INTO conversations_vec (conversation_id, embedding) VALUES (?,?)`).run(BigInt(id), toVecJson(d.embedding)); }
    return id;
  });
  const id = tx(i);
  log.info('Saved conversation', { id, role: i.role });
  return id;
}

export function createProject(
  db: Database.Database,
  i: ProjectInput,
): number {
  const ri = db.prepare(`INSERT INTO projects (name, requirements, architecture) VALUES (?,?,?)`).run(i.name, i.requirements ?? null, i.architecture ?? null);
  const id = Number(ri.lastInsertRowid);
  log.info('Created project', { id, name: i.name });
  return id;
}

export function updateProjectStatus(
  db: Database.Database,
  id: number,
  status: 'planning' | 'active' | 'paused' | 'done',
): void {
  db.prepare(`UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, id);
  log.info('Updated project status', { id, status });
}

export function saveDecision(
  db: Database.Database,
  i: DecisionInput,
): number {
  const tx = db.transaction((d: DecisionInput) => {
    const ri = db.prepare(`INSERT INTO decisions (project_id, decision, rationale, alternatives, made_by) VALUES (?,?,?,?,?)`).run(d.projectId ?? null, d.decision, d.rationale, d.alternatives ?? null, d.madeBy ?? null);
    const id = Number(ri.lastInsertRowid);
    if (d.embedding) { assertEmbedding(d.embedding, 'saveDecision');
      db.prepare(`INSERT INTO decisions_vec (decision_id, embedding) VALUES (?,?)`).run(BigInt(id), toVecJson(d.embedding)); }
    return id;
  });
  const id = tx(i);
  log.info('Saved decision', { id });
  return id;
}

export function saveSkill(
  db: Database.Database,
  i: SkillInput,
): number {
  const tx = db.transaction((d: SkillInput) => {
    const r = db.prepare(`INSERT INTO skills (name, category, content, proficiency, last_used) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(name) DO UPDATE SET category = excluded.category, content = excluded.content, proficiency = excluded.proficiency, last_used = CURRENT_TIMESTAMP RETURNING id`).get(d.name, d.category, d.content, d.proficiency ?? 1) as { id: number };
    const id = r.id;
    if (d.embedding) { assertEmbedding(d.embedding, 'saveSkill'); db.prepare('DELETE FROM skills_vec WHERE skill_id = ?').run(id); db.prepare(`INSERT INTO skills_vec (skill_id, embedding) VALUES (?,?)`).run(BigInt(id), toVecJson(d.embedding)); }
    return id;
  });
  const id = tx(i);
  log.info('Saved skill', { id, name: i.name });
  return id;
}

export function setProfile(
  db: Database.Database,
  key: string,
  value: unknown,
): void {
  const json = JSON.stringify(value);
  db.prepare(`INSERT INTO user_profile (key, value, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, json);
  log.info('Updated profile', { key });
}