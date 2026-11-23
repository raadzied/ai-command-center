// Catalogue for instruction skills (SKILL.md), separate from RAG `skills`.
// `projectId === null` is the shared daily/global container (RFC-72 #6).

import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';

export type SkillSource = 'bundled' | 'global' | 'project';

export interface InstalledSkillInput {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly source: SkillSource;
  readonly scopeProjectId?: number | null;
  readonly path?: string | null;
  readonly contentHash: string;
  readonly defaultEnabled?: boolean;
}

export interface InstalledSkill {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly source: SkillSource;
  readonly scopeProjectId: number | null;
  readonly path: string | null;
  readonly contentHash: string;
  readonly defaultEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectSkillView extends InstalledSkill {
  readonly effectiveEnabled: boolean;
  readonly hasOverride: boolean;
}

interface SkillRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly source: SkillSource;
  readonly scopeProjectId: number | null;
  readonly path: string | null;
  readonly contentHash: string;
  readonly defaultEnabled: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly overrideEnabled: number | null;
}

interface IdRow { readonly id: number; }

function requiredText(value: string, label: string): string {
  const text = value.trim();
  if (text.length === 0) throw new Error(`${label} cannot be empty`);
  return text;
}

function projectIdOrNull(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error('Invalid project id');
  return value;
}

/** Creates or updates an installed skill, keyed by (slug, scope). Returns its id. */
export function upsertInstalledSkill(db: Database.Database, input: InstalledSkillInput): number {
  const slug = requiredText(input.slug, 'slug');
  const name = requiredText(input.name, 'name');
  const scope = projectIdOrNull(input.scopeProjectId);
  const path = input.path?.trim() === '' ? null : (input.path ?? null);
  const hash = requiredText(input.contentHash, 'contentHash');
  const enabled = input.defaultEnabled === false ? 0 : 1;
  const existing = db
    .prepare<[string, number | null], IdRow>(
      'SELECT id FROM installed_skills WHERE slug = ? AND scope_project_id IS ?',
    )
    .get(slug, scope);
  const tx = db.transaction((): number => {
    if (existing) {
      db.prepare(
        `UPDATE installed_skills
         SET name = ?, description = ?, source = ?, path = ?, content_hash = ?,
             default_enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(name, input.description, input.source, path, hash, enabled, existing.id);
      return existing.id;
    }
    const info = db.prepare(
      `INSERT INTO installed_skills
        (slug, name, description, source, scope_project_id, path, content_hash, default_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(slug, name, input.description, input.source, scope, path, hash, enabled);
    return Number(info.lastInsertRowid);
  });
  const id = tx();
  log.info('Installed skill upserted', { id, slug, scopeProjectId: scope });
  return id;
}

/** Lists skills visible to a project (or the daily container), with effective state. */
export function listSkillsForProject(
  db: Database.Database,
  projectId: number | null,
): ProjectSkillView[] {
  const scope = projectIdOrNull(projectId);
  const rows = db.prepare<[number | null, number | null], SkillRow>(
    `SELECT s.id AS id, s.slug AS slug, s.name AS name,
            s.description AS description, s.source AS source,
            s.scope_project_id AS scopeProjectId, s.path AS path,
            s.content_hash AS contentHash, s.default_enabled AS defaultEnabled,
            s.created_at AS createdAt, s.updated_at AS updatedAt,
            ov.enabled AS overrideEnabled
     FROM installed_skills s
     LEFT JOIN project_skills ov
       ON ov.skill_id = s.id AND ov.project_id IS ?
     WHERE s.scope_project_id IS NULL OR s.scope_project_id IS ?
     ORDER BY (s.scope_project_id IS NOT NULL) ASC, s.name COLLATE NOCASE ASC`,
  ).all(scope, scope);
  return rows.map((row: SkillRow): ProjectSkillView => ({
    id: row.id, slug: row.slug, name: row.name, description: row.description,
    source: row.source, scopeProjectId: row.scopeProjectId, path: row.path,
    contentHash: row.contentHash, defaultEnabled: row.defaultEnabled === 1,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    hasOverride: row.overrideEnabled !== null,
    effectiveEnabled: row.overrideEnabled === null
      ? row.defaultEnabled === 1 : row.overrideEnabled === 1,
  }));
}

/** Stores or replaces the per-project ON/OFF override for one skill. */
export function setProjectSkillEnabled(
  db: Database.Database,
  projectId: number | null,
  skillId: number,
  enabled: boolean,
): void {
  const scope = projectIdOrNull(projectId);
  const visible = db.prepare(
    'SELECT 1 FROM installed_skills WHERE id = ? AND (scope_project_id IS NULL OR scope_project_id IS ?)',
  ).get(skillId, scope);
  if (visible === undefined) throw new Error('Skill is not visible in this project');
  const flag = enabled ? 1 : 0;
  const tx = db.transaction((): void => {
    const existing = db.prepare<[number | null, number], IdRow>(
      'SELECT id FROM project_skills WHERE project_id IS ? AND skill_id = ?',
    ).get(scope, skillId);
    if (existing) {
      db.prepare('UPDATE project_skills SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(flag, existing.id);
      return;
    }
    db.prepare('INSERT INTO project_skills (project_id, skill_id, enabled) VALUES (?, ?, ?)')
      .run(scope, skillId, flag);
  });
  tx();
  log.info('Project skill override set', { projectId: scope, skillId, enabled });
}

/** Removes an installed skill; ON/OFF overrides cascade away with it. */
export function removeInstalledSkill(db: Database.Database, skillId: number): boolean {
  const result = db.prepare('DELETE FROM installed_skills WHERE id = ?').run(skillId);
  const removed = result.changes > 0;
  if (removed) log.info('Installed skill removed', { skillId });
  return removed;
}
