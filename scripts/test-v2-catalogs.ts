// STEP 72A — migration v2 + skills/MCP catalogs (no API, no real DB).

import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from '../src/memory/migrations.js';
import { listSkillsForProject, removeInstalledSkill, setProjectSkillEnabled, upsertInstalledSkill } from '../src/memory/skills-catalog.js';
import { listMcpsForProject, markMcpApproved, removeMcpServer, setProjectMcpEnabled, upsertMcpServer } from '../src/memory/mcp-catalog.js';
import { check, countRows, expectThrows, finish, hasIndex, hasTable, readUserVersion } from './test-db-helpers.js';

const V0_SCHEMA = `
  CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'planning', requirements TEXT, architecture TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
    agent_name TEXT, content TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE skills (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
    category TEXT, content TEXT NOT NULL, proficiency INTEGER NOT NULL DEFAULT 1,
    last_used DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE decisions (id INTEGER PRIMARY KEY AUTOINCREMENT, decision TEXT NOT NULL);
  CREATE TABLE user_profile (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

function seedV0(db: Database.Database): void {
  db.exec(V0_SCHEMA);
  db.prepare("INSERT INTO projects (name) VALUES ('alpha')").run();
  db.prepare("INSERT INTO projects (name) VALUES ('beta')").run();
  db.prepare("INSERT INTO skills (name, content) VALUES ('rag-skill', 'legacy')").run();
  db.prepare("INSERT INTO conversations (role, content) VALUES ('user', 'legacy')").run();
}

const V2_TABLES = ['installed_skills', 'project_skills', 'mcp_servers', 'project_mcps'];
const V2_INDEXES = [
  'ux_installed_skills_scope', 'ux_installed_skills_daily',
  'ux_project_skills_scope', 'ux_project_skills_daily',
  'ux_project_mcps_scope', 'ux_project_mcps_daily',
];

function verifyV2(db: Database.Database, label: string): void {
  check(`${label}: user_version = 2`, readUserVersion(db) === 2);
  for (const table of V2_TABLES) check(`${label}: table ${table}`, hasTable(db, table));
  for (const index of V2_INDEXES) check(`${label}: index ${index}`, hasIndex(db, index));
  check(`${label}: legacy skills preserved`, countRows(db, 'skills') === 1);
  check(`${label}: legacy conversations preserved`, countRows(db, 'conversations') === 1);
  check(`${label}: integrity ok`, db.pragma('integrity_check', { simple: true }) === 'ok');
  check(`${label}: foreign keys ok`, (db.pragma('foreign_key_check') as unknown[]).length === 0);
}

function testV0ToV2Memory(): void {
  const db = new Database(':memory:');
  try {
    seedV0(db);
    check('v0 starts at user_version 0', readUserVersion(db) === 0);
    check('v0→v2 returns 2', migrate(db, ':memory:') === 2);
    verifyV2(db, 'v0→v2');
  } finally {
    db.close();
  }
}

function testV1ToV2Memory(): void {
  const db = new Database(':memory:');
  try {
    db.exec(V0_SCHEMA);
    db.exec(`
      ALTER TABLE projects ADD COLUMN root_path TEXT;
      ALTER TABLE projects ADD COLUMN last_opened_at DATETIME;
      CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT,
        title TEXT NOT NULL DEFAULT 'New session',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      ALTER TABLE conversations ADD COLUMN session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL;
    `);
    db.prepare("INSERT INTO projects (name) VALUES ('v1-project')").run();
    db.prepare("INSERT INTO skills (name, content) VALUES ('v1-skill', 'v1')").run();
    db.prepare("INSERT INTO conversations (role, content) VALUES ('user', 'v1')").run();
    db.pragma('user_version = 1');
    check('v1→v2 returns 2', migrate(db, ':memory:') === 2);
    verifyV2(db, 'v1→v2');
  } finally {
    db.close();
  }
}

function testTempFileBackupAndIdempotency(dir: string): void {
  const path = join(dir, 'legacy.db');
  const db = new Database(path);
  try {
    seedV0(db);
    check('file v0→v2 returns 2', migrate(db, path) === 2);
    verifyV2(db, 'file');
    const backups = readdirSync(dir).filter((f) => f.startsWith('legacy.db.backup-v0-'));
    check('pre-v2 backup created once', backups.length === 1);
    check('second migrate is idempotent', migrate(db, path) === 2); check('no extra backup after idempotent migrate', readdirSync(dir).filter((f) => f.startsWith('legacy.db.backup-v0-')).length === 1);
  } finally {
    db.close();
  }
}

function testPartialIndexes(db: Database.Database): void {
  const insertSkill = db.prepare(
    'INSERT INTO installed_skills (slug, name, source, scope_project_id, content_hash) VALUES (?, ?, ?, ?, ?)',
  );
  insertSkill.run('dup', 'Daily dup', 'global', null, 'h1');
  expectThrows('daily installed_skills slug cannot repeat', (): void => {
    insertSkill.run('dup', 'Daily dup 2', 'global', null, 'h2');
  });
  insertSkill.run('dup', 'Project dup', 'project', 1, 'h3');
  check('same slug in a different project is allowed', countRows(db, 'installed_skills') === 2);

  const skillId = Number(insertSkill.run('indexed', 'Indexed', 'global', null, 'h4').lastInsertRowid);
  const insertLink = db.prepare('INSERT INTO project_skills (project_id, skill_id, enabled) VALUES (?, ?, 1)');
  insertLink.run(null, skillId);
  expectThrows('daily project_skills cannot repeat', (): void => { insertLink.run(null, skillId); });
  insertLink.run(1, skillId);
  insertLink.run(2, skillId);
  check('per-project skill overrides are distinct', countRows(db, 'project_skills') === 3);

  const mcpId = upsertMcpServer(db, {
    slug: 'indexed-mcp', name: 'Indexed MCP', transport: 'stdio', runtime: 'node',
    args: ['mcp'], entryPath: 'E:/node22/node.exe', configHash: 'c1',
  });
  const insertMcpLink = db.prepare('INSERT INTO project_mcps (project_id, mcp_id, enabled) VALUES (?, ?, 1)');
  insertMcpLink.run(null, mcpId);
  expectThrows('daily project_mcps cannot repeat', (): void => { insertMcpLink.run(null, mcpId); });
  insertMcpLink.run(1, mcpId);
  insertMcpLink.run(2, mcpId);
  check('per-project MCP overrides are distinct', countRows(db, 'project_mcps') === 3);
}

function testCoalesceAndCatalogs(db: Database.Database): void {
  const dailyId = upsertInstalledSkill(db, {
    slug: 'default-on', name: 'Default ON', description: '', source: 'global',
    contentHash: 'a1',
  });
  const offId = upsertInstalledSkill(db, {
    slug: 'default-off', name: 'Default OFF', description: '', source: 'global',
    contentHash: 'a2', defaultEnabled: false,
  });
  const dailySkills = listSkillsForProject(db, null);
  check('no override → uses default_enabled=1',
    dailySkills.find((s) => s.id === dailyId)?.effectiveEnabled === true);
  check('no override → uses default_enabled=0',
    dailySkills.find((s) => s.id === offId)?.effectiveEnabled === false);

  setProjectSkillEnabled(db, 1, dailyId, false);
  setProjectSkillEnabled(db, 2, offId, true);
  check('project 1 skill OFF is isolated',
    listSkillsForProject(db, 1).find((s) => s.id === dailyId)?.effectiveEnabled === false);
  check('project 2 keeps the default ON',
    listSkillsForProject(db, 2).find((s) => s.id === dailyId)?.effectiveEnabled === true);
  check('project 2 skill ON overrides default OFF',
    listSkillsForProject(db, 2).find((s) => s.id === offId)?.effectiveEnabled === true);
  check('daily bucket is unaffected',
    listSkillsForProject(db, null).find((s) => s.id === dailyId)?.effectiveEnabled === true);

  const mcpId = upsertMcpServer(db, {
    slug: 'anything', name: 'API Anything', transport: 'stdio', runtime: 'node',
    args: ['mcp'], entryPath: 'E:/app/node_modules/api-anything/dist/cli.js',
    configHash: 'v1',
  });
  check('MCP default is OFF', listMcpsForProject(db, null).find((m) => m.id === mcpId)?.effectiveEnabled === false);
  setProjectMcpEnabled(db, 1, mcpId, true);
  check('MCP ON for project 1', listMcpsForProject(db, 1).find((m) => m.id === mcpId)?.effectiveEnabled === true);
  check('MCP OFF for project 2', listMcpsForProject(db, 2).find((m) => m.id === mcpId)?.effectiveEnabled === false);
  markMcpApproved(db, mcpId, 'v1');
  check('approved hash recorded', listMcpsForProject(db, 1).find((m) => m.id === mcpId)?.approvedHash === 'v1');
  check('args persisted as text array',
    listMcpsForProject(db, 1).find((m) => m.id === mcpId)?.args.join(' ') === 'mcp');

  expectThrows('secret-like arg rejected', (): void => {
    upsertMcpServer(db, {
      slug: 'bad-arg', name: 'Bad', transport: 'stdio', runtime: 'node',
      args: ['API_KEY=abc'], entryPath: 'E:/node.exe', configHash: 'b1',
    });
  });
  expectThrows('credential prefix rejected', (): void => {
    upsertMcpServer(db, {
      slug: 'bad-prefix', name: 'Bad', transport: 'stdio', runtime: 'node',
      args: ['sk-abc'], entryPath: 'E:/node.exe', configHash: 'b2',
    });
  });
  expectThrows('secret_ref must be an env name', (): void => {
    upsertMcpServer(db, {
      slug: 'bad-ref', name: 'Bad', transport: 'stdio', runtime: 'node',
      args: ['mcp'], entryPath: 'E:/node.exe', secretRef: 'API_KEY=abc', configHash: 'b3',
    });
  });
  check('remove installed skill cascades overrides', removeInstalledSkill(db, dailyId));
  check('remove MCP cascades overrides', removeMcpServer(db, mcpId));
  check('remove cascades only its own overrides',
    countRows(db, 'project_skills') === 4 && countRows(db, 'project_mcps') === 3);
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'apex-v2-catalogs-'));
  try {
    console.log('=== STEP 72A — v2 catalogs test ===\n');
    testV0ToV2Memory();
    testV1ToV2Memory();
    testTempFileBackupAndIdempotency(dir);

    const db = new Database(':memory:');
    try {
      seedV0(db);
      migrate(db, ':memory:');
      testPartialIndexes(db);
      testCoalesceAndCatalogs(db);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  finish();
}

main();
