import type Database from 'better-sqlite3';
import { basename, resolve } from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { logger as log } from '../llm/logger.js';

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'done';

export interface WorkspaceProject {
  readonly id: number;
  readonly name: string;
  readonly rootPath: string;
  readonly status: ProjectStatus;
  readonly lastOpenedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProjectRow {
  readonly id: number;
  readonly name: string;
  readonly rootPath: string;
  readonly status: string;
  readonly lastOpenedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const COLUMNS = `id, name, root_path AS rootPath, status,
  last_opened_at AS lastOpenedAt, created_at AS createdAt, updated_at AS updatedAt`;

const MAX_NAME_SUFFIX = 999;
const MAX_LIST_LIMIT = 200;

function isProjectStatus(value: string): value is ProjectStatus {
  return value === 'planning' || value === 'active' || value === 'paused' || value === 'done';
}

function toProject(row: ProjectRow): WorkspaceProject {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.rootPath,
    // CHECK constraint يضمن قيمة صالحة؛ الفرع الاحتياطي للنوع فقط.
    status: isProjectStatus(row.status) ? row.status : 'planning',
    lastOpenedAt: row.lastOpenedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * يطبّع جذر مشروع: مسار مطلق + realpath (حالة أحرف القرص والـ symlinks).
 * يرمي إن كان المسار غير موجود أو ليس مجلدًا.
 */
export function normalizeRootPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('Project root path is empty');
  }

  const resolved = resolve(trimmed);
  let real: string;
  try {
    real = realpathSync.native(resolved);
  } catch (err) {
    throw new Error(`Project root does not exist or is inaccessible: ${resolved}`, { cause: err });
  }

  if (!statSync(real).isDirectory()) {
    throw new Error(`Project root is not a directory: ${real}`);
  }
  return real;
}

export function getProjectByRootPath(
  db: Database.Database,
  rootPath: string,
): WorkspaceProject | null {
  const row = db
    .prepare<[string], ProjectRow>(
      `SELECT ${COLUMNS} FROM projects WHERE root_path = ? COLLATE NOCASE LIMIT 1`,
    )
    .get(rootPath);
  return row === undefined ? null : toProject(row);
}

export function getWorkspaceProject(
  db: Database.Database,
  id: number,
): WorkspaceProject | null {
  const row = db
    .prepare<[number], ProjectRow>(
      `SELECT ${COLUMNS} FROM projects WHERE id = ? AND root_path IS NOT NULL`,
    )
    .get(id);
  return row === undefined ? null : toProject(row);
}

/** يحدّث last_opened_at ويعيد السجل المحدّث، أو null إن لم يوجد مشروع مجلد بهذا المعرّف. */
export function touchProjectOpened(
  db: Database.Database,
  id: number,
): WorkspaceProject | null {
  const info = db
    .prepare<[number]>(
      `UPDATE projects
       SET last_opened_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND root_path IS NOT NULL`,
    )
    .run(id);
  return info.changes === 0 ? null : getWorkspaceProject(db, id);
}

export function listWorkspaceProjects(
  db: Database.Database,
  limit = 20,
): WorkspaceProject[] {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), MAX_LIST_LIMIT));
  const rows = db
    .prepare<[number], ProjectRow>(
      `SELECT ${COLUMNS} FROM projects
       WHERE root_path IS NOT NULL
       ORDER BY COALESCE(last_opened_at, updated_at, created_at) DESC, id DESC
       LIMIT ?`,
    )
    .all(safeLimit);
  return rows.map(toProject);
}

function projectNameExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare<[string], { present: number }>(
      'SELECT 1 AS present FROM projects WHERE name = ? LIMIT 1',
    )
    .get(name);
  return row !== undefined;
}

/** يشتق اسمًا فريدًا: basename، ثم "basename (2)"، "basename (3)"... */
function deriveProjectName(
  db: Database.Database,
  rootPath: string,
  preferred?: string,
): string {
  const trimmed = preferred?.trim() ?? '';
  const base = trimmed.length > 0
    ? trimmed
    : (basename(rootPath).trim() || 'project');

  let candidate = base;
  let suffix = 2;
  while (projectNameExists(db, candidate)) {
    if (suffix > MAX_NAME_SUFFIX) {
      throw new Error(`Unable to derive a unique project name from: ${base}`);
    }
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function insertWorkspaceProject(
  db: Database.Database,
  rootPath: string,
  preferredName?: string,
): WorkspaceProject {
  const tx = db.transaction((): number => {
    const existing = getProjectByRootPath(db, rootPath);
    if (existing !== null) {
      throw new Error(`Project already registered: ${rootPath} (id ${existing.id})`);
    }

    const name = deriveProjectName(db, rootPath, preferredName);
    const info = db
      .prepare<[string, string]>(
        `INSERT INTO projects (name, root_path, status, last_opened_at)
         VALUES (?, ?, 'active', CURRENT_TIMESTAMP)`,
      )
      .run(name, rootPath);
    return Number(info.lastInsertRowid);
  });

  const id = tx.immediate();
  const created = getWorkspaceProject(db, id);
  if (created === null) {
    throw new Error(`Project row missing after insert: ${id}`);
  }
  log.info('Created workspace project', { id, rootPath, name: created.name });
  return created;
}

/** ينشئ مشروع مجلد جديدًا. يرمي إن كان المسار مسجلًا مسبقًا. */
export function createWorkspaceProject(
  db: Database.Database,
  rootPath: string,
  name?: string,
): WorkspaceProject {
  return insertWorkspaceProject(db, normalizeRootPath(rootPath), name);
}

/** يفتح مشروعًا موجودًا (ويحدّث last_opened_at) أو ينشئه إن لم يكن مسجلًا. */
export function openWorkspaceProject(
  db: Database.Database,
  rootPath: string,
): WorkspaceProject {
  const normalized = normalizeRootPath(rootPath);
  const existing = getProjectByRootPath(db, normalized);
  if (existing === null) {
    return insertWorkspaceProject(db, normalized);
  }

  const touched = touchProjectOpened(db, existing.id);
  if (touched === null) {
    throw new Error(`Failed to update project ${existing.id}`);
  }
  log.info('Opened workspace project', { id: existing.id });
  return touched;
}
