// STEP 75 — diff preview, hash recheck and atomic write (temp files only).

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunScope, ClassifiedAction } from '../src/types.js';
import { initDb, closeDb } from '../src/memory/db.js';
import { setApprovalStrategy } from '../src/security/approval.js';
import { buildUnifiedDiff, sha256Text } from '../src/tools/diff.js';
import { writeProjectFile } from '../src/tools/filesystem.js';
import { check, finish } from './test-db-helpers.js';

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'apex-diff-approval-'));
  initDb(join(dir, 'test.db'));
  const filePath = join(dir, 'note.txt');
  const scope: RunScope = {
    kind: 'workspace', windowId: null, projectId: null, sessionId: null,
    workspaceRoot: dir,
  };
  try {
    console.log('=== STEP 75 — Diff / Hash / Atomic Write Test ===\n');

    const created = buildUnifiedDiff('note.txt', null, 'one\ntwo\n');
    check('new file flagged', created.isNew);
    check('new file has no before hash', created.beforeHash === null);
    check('new file counts added lines', created.added === 2 && created.removed === 0);
    check('new file uses plus prefixes', created.diff.includes('+ one'));

    const before = 'one\ntwo\n';
    const modified = buildUnifiedDiff('note.txt', before, 'one\nthree\n');
    check('modified file flagged', !modified.isNew);
    check('before hash matches sha256', modified.beforeHash === sha256Text(before));
    check('modified counts both sides', modified.added === 1 && modified.removed === 1);
    check('diff shows deletion', modified.diff.includes('- two'));
    check('diff shows addition', modified.diff.includes('+ three'));

    let seenPreview: string | null = null;
    setApprovalStrategy({
      ask: async (action: ClassifiedAction): Promise<'user_approved'> => {
        seenPreview = action.preview?.beforeHash ?? null;
        return 'user_approved';
      },
    });

    writeFileSync(filePath, 'original\n', 'utf8');
    const ok = await writeProjectFile('note.txt', 'updated\n', scope);
    check('atomic write executed', ok.executed);
    check('atomic write content correct', readFileSync(filePath, 'utf8') === 'updated\n');
    check('preview reached approval gate', seenPreview === sha256Text('original\n'));
    const leftovers = readdirSync(dir).filter((name) => name.includes('.tmp-'));
    check('no temp files left behind', leftovers.length === 0);

    // The approval hook simulates a manual edit made while the user decides.
    setApprovalStrategy({
      ask: async (): Promise<'user_approved'> => {
        writeFileSync(filePath, 'manual edit\n', 'utf8');
        return 'user_approved';
      },
    });
    writeFileSync(filePath, 'expected\n', 'utf8');
    const conflict = await writeProjectFile('note.txt', 'overwrite\n', scope);
    check('hash conflict rejected the write', !conflict.executed);
    check('conflict error is explicit',
      typeof conflict.error === 'string' && conflict.error.includes('تغيّر الملف على القرص'));
    check('manual edit was preserved', readFileSync(filePath, 'utf8') === 'manual edit\n');
  } finally {
    closeDb();
    rmSync(dir, { recursive: true, force: true });
  }
  finish();
}

void main();
