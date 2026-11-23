import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/memory/db.js';
import {
  createWorkspaceProject,
  getProjectByRootPath,
  listWorkspaceProjects,
  normalizeRootPath,
  openWorkspaceProject,
  touchProjectOpened,
} from '../src/memory/projects.js';
import {
  createSession,
  getRecentSessionMessages,
  getSession,
  listProjectSessions,
  renameSession,
  sanitizeSessionTitle,
  touchSession,
} from '../src/memory/sessions.js';
import { saveConversation } from '../src/memory/store.js';
import { retrieveConversations } from '../src/memory/retrieve.js';
import { check, expectThrows, finish, makeVector } from './test-db-helpers.js';

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'apex-projects-'));
  const dirA = join(dir, 'one', 'app');
  const dirB = join(dir, 'two', 'app');
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });

  const db = openDb(join(dir, 'test.db'));

  try {
    console.log('=== Projects & Sessions Test ===\n');

    // ── المشاريع ─────────────────────────────────────────
    const projectA = createWorkspaceProject(db, dirA);
    check(
      'project A created with normalized root',
      projectA.name === 'app' && projectA.rootPath === normalizeRootPath(dirA),
    );

    const projectB = createWorkspaceProject(db, dirB);
    check('name collision resolved with (2)', projectB.name === 'app (2)');
    check(
      'list orders most recently opened first',
      listWorkspaceProjects(db).map((p) => p.id).join(',') === `${projectB.id},${projectA.id}`,
    );

    expectThrows('duplicate root path rejected', () => {
      createWorkspaceProject(db, dirA);
    });
    expectThrows('missing root rejected', () => {
      openWorkspaceProject(db, join(dir, 'missing'));
    });

    writeFileSync(join(dir, 'plain-file.txt'), 'x');
    expectThrows('file root rejected', () => {
      normalizeRootPath(join(dir, 'plain-file.txt'));
    });

    check(
      'getProjectByRootPath normalizes .. segments',
      getProjectByRootPath(db, normalizeRootPath(join(dirA, '..', 'app')))?.id === projectA.id,
    );

    const opened = openWorkspaceProject(db, dirA);
    check('openWorkspaceProject reuses the row', opened.id === projectA.id);
    check('openWorkspaceProject touches last_opened_at', opened.lastOpenedAt !== null);
    check('touchProjectOpened rejects unknown id', touchProjectOpened(db, 999999) === null);

    // ── الجلسات ──────────────────────────────────────────
    const sessionA = createSession(db, projectA.id, '  Fix   the   bug  ');
    const sessionA2 = createSession(db, projectA.id, 'Second session');
    const sessionB = createSession(db, projectB.id, 'Other project');
    const daily = createSession(db, null, 'Daily chat');

    check('session title sanitized', getSession(db, sessionA)?.title === 'Fix the bug');
    check('explicit session title preserved', getSession(db, sessionA2)?.title === 'Second session');
    check(
      'project A sessions isolated',
      listProjectSessions(db, projectA.id).map((s) => s.id).sort((a, b) => a - b).join(',')
        === [sessionA, sessionA2].sort((a, b) => a - b).join(','),
    );
    check(
      'daily sessions isolated',
      listProjectSessions(db, null).map((s) => s.id).join(',') === String(daily),
    );
    expectThrows('unknown project rejected', () => {
      createSession(db, 999999, 'orphan');
    });

    renameSession(db, sessionA, 'Renamed session');
    check('renameSession works', getSession(db, sessionA)?.title === 'Renamed session');
    expectThrows('rename unknown session rejected', () => {
      renameSession(db, 999999, 'nope');
    });

    db.prepare("UPDATE sessions SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(sessionA2);
    touchSession(db, sessionA2);
    check(
      'touchSession updates updated_at',
      getSession(db, sessionA2)?.updatedAt !== '2000-01-01 00:00:00',
    );
    check(
      'touchSession reorders project sessions',
      listProjectSessions(db, projectA.id)[0]?.id === sessionA2,
    );

    check('long title truncated to 120 chars', sanitizeSessionTitle('x'.repeat(200)).length === 120);
    check(
      'title truncation keeps surrogate pairs',
      Array.from(sanitizeSessionTitle('😀'.repeat(130))).length === 120,
    );

    // ── الرسائل والاسترجاع ───────────────────────────────
    const msgA1 = saveConversation(db, {
      role: 'user', content: 'alpha one', embedding: makeVector(11), sessionId: sessionA,
    });
    const msgA2 = saveConversation(db, {
      role: 'agent', agentName: 'coder', content: 'alpha two',
      embedding: makeVector(12), sessionId: sessionA,
    });
    const msgA3 = saveConversation(db, {
      role: 'user', content: 'alpha three', embedding: makeVector(13), sessionId: sessionA,
    });
    for (let i = 1; i <= 12; i += 1) {
      saveConversation(db, {
        role: 'user', content: `beta ${i}`, embedding: makeVector(100 + i), sessionId: sessionB,
      });
    }
    saveConversation(db, { role: 'user', content: 'daily one', embedding: makeVector(201) });
    saveConversation(db, { role: 'user', content: 'daily two', embedding: makeVector(202) });

    const recent = getRecentSessionMessages(db, sessionA, 2);
    check(
      'recent messages are the last N in chronological order',
      recent.length === 2 && recent[0]?.id === msgA2 && recent[1]?.id === msgA3,
    );
    check(
      'recent messages include all when limit is high',
      getRecentSessionMessages(db, sessionA, 10).length === 3,
    );
    check('first message id preserved', msgA1 < msgA2);

    const query = makeVector(11);
    const projectAResults = retrieveConversations(db, query, 5, { projectId: projectA.id });
    check(
      'project filter returns only project A',
      projectAResults.length === 3 && projectAResults.every((r) => r.sessionId === sessionA),
    );

    const projectBResults = retrieveConversations(db, query, 20, { projectId: projectB.id });
    check(
      'project B filter isolated',
      projectBResults.length === 12 && projectBResults.every((r) => r.sessionId === sessionB),
    );

    const dailyResults = retrieveConversations(db, query, 5, { projectId: null });
    check(
      'daily filter returns unscoped messages only',
      dailyResults.length === 2 && dailyResults.every((r) => r.sessionId === null),
    );

    const sessionResults = retrieveConversations(db, query, 5, { sessionId: sessionB });
    check(
      'session filter returns only that session',
      sessionResults.length === 5 && sessionResults.every((r) => r.sessionId === sessionB),
    );

    check(
      'unfiltered retrieval keeps legacy behavior',
      retrieveConversations(db, query, 50).length === 17,
    );

    expectThrows('conversation with unknown session rejected', () => {
      saveConversation(db, { role: 'user', content: 'orphan', sessionId: 999999 });
    });
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }

  finish();
}

main();
