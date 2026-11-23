// Instruction-skills engine: SKILL.md parsing, catalog sync and safe prompt injection.
// Never touches the legacy RAG `skills` table.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';
import type { RunScope } from '../types.js';
import {
  listSkillsForProject,
  upsertInstalledSkill,
  type ProjectSkillView,
} from '../memory/skills-catalog.js';

export const GLOBAL_SKILLS_DIR = resolve(process.cwd(), 'data', 'skills');

const MAX_SKILLS = 6;
const MAX_PER_SKILL = 1500;
const MAX_TOTAL = 9000;
const MAX_FILE_BYTES = 64 * 1024;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface InjectedSkill {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

interface ParsedSkill {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly body: string;
  readonly contentHash: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 &&
      ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
       (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** Parses YAML frontmatter (name/description) plus the Markdown body. */
export function parseSkillFile(raw: string, fallbackSlug: string): ParsedSkill {
  const contentHash = createHash('sha256').update(raw).digest('hex');
  let frontmatter: Record<string, string> = {};
  let body = raw;
  if (raw.startsWith('---')) {
    const lines = raw.split(/\r?\n/);
    const end = lines.findIndex((line: string, index: number): boolean =>
      index > 0 && /^---\s*$/.test(line));
    if (end > 0) {
      const fields: Record<string, string> = {};
      for (const line of lines.slice(1, end)) {
        const match = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
        const key = match?.[1];
        const value = match?.[2];
        if (key !== undefined && value !== undefined) fields[key] = unquote(value);
      }
      frontmatter = fields;
      body = lines.slice(end + 1).join('\n').trim();
    }
  }
  const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? '';
  const nameValue = frontmatter['name'] ?? heading.trim() ?? fallbackSlug;
  const name = nameValue.trim() || fallbackSlug;
  const description = (frontmatter['description'] ?? '').trim();
  const rawSlug = fallbackSlug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = SLUG_PATTERN.test(rawSlug) ? rawSlug : `skill-${contentHash.slice(0, 8)}`;
  return { slug, name, description, body, contentHash };
}

function scanFolder(
  db: Database.Database,
  folder: string,
  source: 'global' | 'project',
  scopeProjectId: number | null,
): number {
  if (!existsSync(folder)) return 0;
  let synced = 0;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(folder, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    try {
      const parsed = parseSkillFile(readFileSync(file, 'utf8'), entry.name);
      upsertInstalledSkill(db, {
        slug: parsed.slug, name: parsed.name, description: parsed.description,
        source, scopeProjectId, path: file, contentHash: parsed.contentHash,
      });
      synced += 1;
    } catch (err) {
      log.warn('Skill file sync failed', {
        file, message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return synced;
}

/** Syncs global + project-local SKILL.md files into installed_skills. Returns count. */
export function syncSkillsCatalog(db: Database.Database, scope?: RunScope): number {
  mkdirSync(GLOBAL_SKILLS_DIR, { recursive: true });
  let count = scanFolder(db, GLOBAL_SKILLS_DIR, 'global', null);
  if (scope?.kind === 'workspace' && scope.workspaceRoot.trim() !== '') {
    const projectFolder = join(scope.workspaceRoot, '.github', 'skills');
    const projectId = scope.projectId;
    count += scanFolder(db, projectFolder, 'project', projectId);
  }
  log.info('Skills catalog synced', { count, projectId: scope?.kind === 'workspace' ? scope.projectId : null });
  return count;
}

const TRUNCATED_MARKER = '\n[truncated]';

function truncateAtParagraph(text: string, max: number): string {
  if (text.length <= max) return text;
  const budget = max - TRUNCATED_MARKER.length;
  const window = text.slice(0, budget);
  const boundary = window.lastIndexOf('\n\n');
  const safe = boundary > Math.floor(budget * 0.6) ? window.slice(0, boundary) : window;
  return safe.trimEnd() + TRUNCATED_MARKER;
}

function projectFirst(a: ProjectSkillView, b: ProjectSkillView): number {
  const aProject = a.scopeProjectId === null ? 1 : 0;
  const bProject = b.scopeProjectId === null ? 1 : 0;
  return aProject - bProject || a.name.localeCompare(b.name);
}

/** Loads at most 6 enabled skills within a strict 9,000-character budget. */
export function loadActiveInstructionSkills(
  db: Database.Database,
  scope?: RunScope,
): InjectedSkill[] {
  const projectId = scope?.kind === 'workspace' ? scope.projectId : null;
  const skills = listSkillsForProject(db, projectId).filter((s) => s.effectiveEnabled);
  const result: InjectedSkill[] = [];
  let used = 0;
  for (const skill of [...skills].sort(projectFirst)) {
    if (result.length >= MAX_SKILLS || skill.path === null) continue;
    try {
      const body = readFileSync(skill.path, 'utf8');
      const text = skill.description === '' ? body : `${skill.description}\n\n${body}`;
      const chunk = truncateAtParagraph(text, MAX_PER_SKILL);
      if (used + chunk.length > MAX_TOTAL) break;
      result.push({ name: skill.name, description: skill.description, body: chunk });
      used += chunk.length;
    } catch (err) {
      log.warn('Enabled skill could not be loaded', {
        skillId: skill.id, message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}

/** Copies a selected .md file into the global skills folder and registers it. */
export function importSkillFile(db: Database.Database, sourceFilePath: string): number {
  const stats = statSync(sourceFilePath);
  if (!stats.isFile()) throw new Error('Skill source is not a file');
  if (stats.size > MAX_FILE_BYTES) throw new Error('Skill file exceeds 64KB');
  const raw = readFileSync(sourceFilePath, 'utf8');
  const fallback = basename(sourceFilePath, '.md') ||
    basename(dirname(sourceFilePath)) || 'imported-skill';
  const parsed = parseSkillFile(raw, fallback);
  const target = join(GLOBAL_SKILLS_DIR, parsed.slug, 'SKILL.md');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourceFilePath, target);
  const id = upsertInstalledSkill(db, {
    slug: parsed.slug, name: parsed.name, description: parsed.description,
    source: 'global', scopeProjectId: null, path: target,
    contentHash: parsed.contentHash, defaultEnabled: true,
  });
  log.info('Skill imported', { id, slug: parsed.slug, target });
  return id;
}
