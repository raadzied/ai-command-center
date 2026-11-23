import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/memory/db.js';
import {
  check,
  countRows,
  expectThrows,
  finish,
  hasIndex,
  hasTable,
  makeVector,
  readUserVersion,
  tableColumns,
} from './test-db-helpers.js';

// مخطط v0 مطابق لـ schema.sql المجمّد (قبل أي ترحيل).
const LEGACY_SCHEMA = `
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user','agent')),
  agent_name TEXT,
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_conv_timestamp ON conversations(timestamp DESC);
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','paused','done')),
  requirements TEXT,
  architecture TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives TEXT,
  made_by TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  content TEXT NOT NULL,
  proficiency INTEGER NOT NULL DEFAULT 1
    CHECK (proficiency BETWEEN 1 AND 5),
  last_used DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE VIRTUAL TABLE skills_vec USING vec0(skill_id INTEGER PRIMARY KEY, embedding FLOAT[768]);
CREATE VIRTUAL TABLE conversations_vec USING vec0(conversation_id INTEGER PRIMARY KEY, embedding FLOAT[768]);
CREATE VIRTUAL TABLE decisions_vec USING vec0(decision_id INTEGER PRIMARY KEY, embedding FLOAT[768]);
`;

const SKILL_COUNT = 20;
const CONVERSATION_COUNT = 12;

function seedLegacyDb(path: string): void {
  const db = new Database(path);
  sqliteVec.load(db);
  db.exec(LEGACY_SCHEMA);

  const insertConv = db.prepare('INSERT INTO conversations (role, content) VALUES (?, ?)');
  const insertConvVec = db.prepare(
    'INSERT INTO conversations_vec (conversation_id, embedding) VALUES (?, ?)',
  );
  for (let i = 1; i <= CONVERSATION_COUNT; i += 1) {
    const info = insertConv.run(i % 2 === 0 ? 'agent' : 'user', `legacy conversation ${i}`);
    insertConvVec.run(BigInt(Number(info.lastInsertRowid)), JSON.stringify(makeVector(i)));
  }

  const insertSkill = db.prepare(
    'INSERT INTO skills (name, category, content, proficiency) VALUES (?, ?, ?, ?)',
  );
  const insertSkillVec = db.prepare(
    'INSERT INTO skills_vec (skill_id, embedding) VALUES (?, ?)',
  );
  for (let i = 1; i <= SKILL_COUNT; i += 1) {
    const info = insertSkill.run(`legacy-skill-${i}`, 'legacy', `legacy skill ${i}`, 3);
    insertSkillVec.run(BigInt(Number(info.lastInsertRowid)), JSON.stringify(makeVector(1000 + i)));
  }

  db.prepare("INSERT INTO projects (name, status) VALUES ('legacy-a', 'planning')").run();
  db.prepare("INSERT INTO projects (name, status) VALUES ('legacy-b', 'active')").run();
  db.prepare("INSERT INTO decisions (project_id, decision, rationale) VALUES (1, 'd1', 'r1')").run();

  check('legacy DB starts at user_version 0', readUserVersion(db) === 0);
  db.close();
}

function verifyMigrated(db: Database.Database): void {
  check('user_version is 1', readUserVersion(db) === 1);
  check('projects.root_path exists', tableColumns(db, 'projects').includes('root_path'));
  check('projects.last_opened_at exists', tableColumns(db, 'projects').includes('last_opened_at'));
  check('conversations.session_id exists', tableColumns(db, 'conversations').includes('session_id'));
  check('sessions table exists', hasTable(db, 'sessions'));
  check('ux_projects_root index exists', hasIndex(db, 'ux_projects_root'));
  check('idx_sessions_project_updated exists', hasIndex(db, 'idx_sessions_project_updated'));
  check('idx_conv_session_ts exists', hasIndex(db, 'idx_conv_session_ts'));
  check(`conversations preserved (${CONVERSATION_COUNT})`, countRows(db, 'conversations') === CONVERSATION_COUNT);
  check(`skills preserved (${SKILL_COUNT})`, countRows(db, 'skills') === SKILL_COUNT);
  check('projects preserved (2)', countRows(db, 'projects') === 2);
  check('decisions preserved (1)', countRows(db, 'decisions') === 1);

  const legacyScoped = db
    .prepare('SELECT COUNT(*) AS n FROM conversations WHERE session_id IS NULL')
    .get() as { n: number };
  check('legacy conversations keep NULL session_id', legacyScoped.n === CONVERSATION_COUNT);

  check('integrity_check = ok', db.pragma('integrity_check', { simple: true }) === 'ok');
  check('foreign_key_check is empty', (db.pragma('foreign_key_check') as unknown[]).length === 0);

  const knn = db
    .prepare(
      'SELECT conversation_id FROM conversations_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 3',
    )
    .all(JSON.stringify(makeVector(1)));
  check('conversations_vec KNN still works', knn.length === 3);

  db.prepare("INSERT INTO projects (name, root_path) VALUES ('root-a', 'C:\\workspace\\same')").run();
  expectThrows('duplicate root_path is rejected', () => {
    db.prepare("INSERT INTO projects (name, root_path) VALUES ('root-b', 'C:\\workspace\\same')").run();
  });

  const projectId = Number(
    db.prepare("INSERT INTO projects (name, root_path) VALUES ('fk-project', 'C:\\workspace\\fk')")
      .run().lastInsertRowid,
  );
  const sessionId = Number(
    db.prepare("INSERT INTO sessions (project_id, title) VALUES (?, 'fk session')")
      .run(projectId).lastInsertRowid,
  );
  expectThrows('sessions.project_id ON DELETE RESTRICT', () => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });

  const convId = Number(
    db.prepare("INSERT INTO conversations (role, content, session_id) VALUES ('user', 'scoped', ?)")
      .run(sessionId).lastInsertRowid,
  );
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  const scoped = db
    .prepare('SELECT session_id AS sessionId FROM conversations WHERE id = ?')
    .get(convId) as { sessionId: number | null } | undefined;
  check('conversations.session_id ON DELETE SET NULL', scoped?.sessionId === null);
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'apex-migration-'));
  const legacyPath = join(dir, 'legacy.db');
  const freshPath = join(dir, 'fresh.db');

  try {
    console.log('=== Migration Test ===\n');
    seedLegacyDb(legacyPath);

    const db = openDb(legacyPath);
    try {
      verifyMigrated(db);
    } finally {
      db.close();
    }

    const backups = readdirSync(dir).filter((file) => file.startsWith('legacy.db.backup-v0-'));
    check('pre-migration backup created', backups.length === 1);

    const backupName = backups[0];
    if (backupName !== undefined) {
      const backup = new Database(join(dir, backupName));
      sqliteVec.load(backup);
      check('backup keeps user_version 0', readUserVersion(backup) === 0);
      check('backup keeps conversations', countRows(backup, 'conversations') === CONVERSATION_COUNT);
      backup.close();
    }

    const reopened = openDb(legacyPath);
    try {
      check('reopen keeps user_version 1', readUserVersion(reopened) === 1);
      check(
        'reopen is idempotent (no second backup)',
        readdirSync(dir).filter((file) => file.startsWith('legacy.db.backup-v0-')).length === 1,
      );
    } finally {
      reopened.close();
    }

    const fresh = openDb(freshPath);
    try {
      check('fresh DB migrated to user_version 1', readUserVersion(fresh) === 1);
      check('fresh DB has sessions table', hasTable(fresh, 'sessions'));
      check(
        'fresh DB needs no backup',
        readdirSync(dir).filter((file) => file.startsWith('fresh.db.backup')).length === 0,
      );
    } finally {
      fresh.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  finish();
}

main();
