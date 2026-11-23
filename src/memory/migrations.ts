import type Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { logger as log } from '../llm/logger.js';

/**
 * ترحيلات قاعدة البيانات — إضافية فقط (ALTER/CREATE)، كل إصدار داخل معاملة واحدة.
 * ⚠️ لا تُضاف أي `ALTER TABLE` إلى schema.sql: يُنفَّذ عند كل فتح لقاعدة البيانات.
 */

/** أعلى إصدار ترحيل يعرفه هذا الإصدار من الكود. */
export const SCHEMA_VERSION = 1;

interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: (db: Database.Database) => void;
}

interface ColumnRow {
  readonly name: string;
}

const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'workspace-projects-and-sessions', up: migrateV1 },
];

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return value;
}

function hasTable(db: Database.Database, table: string): boolean {
  const name = assertIdentifier(table);
  const row = db
    .prepare<[string], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name);
  return row !== undefined;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const name = assertIdentifier(table);
  const rows = db.pragma(`table_info(${name})`) as ColumnRow[];
  return rows.some((row: ColumnRow) => row.name === column);
}

function readUserVersion(db: Database.Database): number {
  const value = db.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** هل تحتوي القاعدة على بيانات مستخدم تستحق نسخة احتياطية قبل الترحيل؟ */
function hasLegacyData(db: Database.Database): boolean {
  for (const table of ['conversations', 'projects', 'skills', 'decisions', 'user_profile']) {
    if (!hasTable(db, table)) continue;
    const name = assertIdentifier(table);
    const row = db.prepare<[], { present: number }>(`SELECT 1 AS present FROM ${name} LIMIT 1`).get();
    if (row !== undefined) return true;
  }
  return false;
}

/** نسخة احتياطية ذرّية قبل الترحيل. تفشل الترحيل بالكامل إن فشلت النسخة. */
function backupBeforeMigrate(
  db: Database.Database,
  dbPath: string | undefined,
  fromVersion: number,
): void {
  if (dbPath === undefined || dbPath === ':memory:' || dbPath.startsWith('file:')) return;
  if (!hasLegacyData(db)) {
    log.debug('Skipping pre-migration backup (empty database)', { fromVersion });
    return;
  }

  const base = `${dbPath}.backup-v${fromVersion}-${Date.now()}-${process.pid}`;
  let target = base;
  let counter = 2;
  while (existsSync(target)) {
    target = `${base}-${counter}`;
    counter += 1;
  }

  db.exec(`VACUUM INTO ${quoteSqlString(target)}`);
  log.info('Pre-migration backup created', { target, fromVersion });
}

/** v1: مشاريع المجلدات + الجلسات + ربط المحادثات بالجلسة. إضافي فقط. */
function migrateV1(db: Database.Database): void {
  if (!hasColumn(db, 'projects', 'root_path')) {
    db.exec('ALTER TABLE projects ADD COLUMN root_path TEXT');
  }
  if (!hasColumn(db, 'projects', 'last_opened_at')) {
    db.exec('ALTER TABLE projects ADD COLUMN last_opened_at DATETIME');
  }

  // لا يمكن إضافة UNIQUE عبر ALTER TABLE — فهرس فريد جزئي بدلًا من ذلك.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_root
      ON projects(root_path COLLATE NOCASE)
      WHERE root_path IS NOT NULL
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
      title      TEXT NOT NULL DEFAULT 'New session',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_project_updated
      ON sessions(project_id, updated_at DESC)
  `);

  if (!hasColumn(db, 'conversations', 'session_id')) {
    db.exec(`
      ALTER TABLE conversations ADD COLUMN session_id INTEGER
        REFERENCES sessions(id) ON DELETE SET NULL
    `);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conv_session_ts
      ON conversations(session_id, timestamp DESC)
  `);
}

/** يطبّق إصدارًا واحدًا داخل معاملة فورية ويعيد true إن طُبّق فعلًا. */
function applyMigration(db: Database.Database, migration: Migration): boolean {
  const run = db.transaction((): boolean => {
    const current = readUserVersion(db);
    if (current >= migration.version) return false;
    migration.up(db);
    db.pragma(`user_version = ${migration.version}`);
    return true;
  });
  return run.immediate();
}

/**
 * يرقّي القاعدة إلى SCHEMA_VERSION.
 * @returns الإصدار النهائي بعد الترحيل.
 */
export function migrate(db: Database.Database, dbPath?: string): number {
  const startVersion = readUserVersion(db);
  if (startVersion >= SCHEMA_VERSION) {
    log.debug('DB schema up to date', { version: startVersion });
    return startVersion;
  }

  const pending = MIGRATIONS
    .filter((migration: Migration) => migration.version > startVersion)
    .sort((a: Migration, b: Migration) => a.version - b.version);

  if (pending.length === 0) return startVersion;

  backupBeforeMigrate(db, dbPath, startVersion);

  let applied = 0;
  for (const migration of pending) {
    if (applyMigration(db, migration)) applied += 1;
  }

  const finalVersion = readUserVersion(db);
  log.info('DB migrated', { from: startVersion, to: finalVersion, applied });
  return finalVersion;
}
