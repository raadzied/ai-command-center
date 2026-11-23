// STEP 78 — [[MKDIR:...]] creation, daily refusal, traversal and protected paths.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunScope } from '../src/types.js';
import { processMarkers } from '../src/tools/markers.js';
import { DAILY_DISABLED } from '../src/tools/filesystem.js';
import { extractMkdirInstructions } from '../src/tools/fs-mkdir.js';
import { check, finish } from './test-db-helpers.js';

const ESCAPE_DIR = join(tmpdir(), 'apex-mkdir-escape');

async function main(): Promise<void> {
  console.log('=== STEP 78 — MKDIR Markers Test ===\n');
  const root = mkdtempSync(join(tmpdir(), 'apex-mkdir-'));
  const ws: RunScope = {
    kind: 'workspace', windowId: null, projectId: 1, sessionId: null,
    workspaceRoot: root,
  };
  const daily: RunScope = { kind: 'daily', windowId: null, sessionId: null };

  try {
    rmSync(ESCAPE_DIR, { recursive: true, force: true });

    check('extract trims the path',
      extractMkdirInstructions('x [[MKDIR:  src/app  ]] y')[0] === 'src/app');

    const created = await processMarkers('[[MKDIR:src/components]]\n[[MKDIR:docs]]', ws);
    check('plain directory created', existsSync(join(root, 'src', 'components')));
    check('second directory created', existsSync(join(root, 'docs')));
    check('created directories listed in the summary',
      created.writeStatus.includes('src/components') && created.writeStatus.includes('docs'));

    const nested = await processMarkers('[[MKDIR:a/b/c/d]]', ws);
    check('nested directory created recursively', existsSync(join(root, 'a', 'b', 'c', 'd')));
    check('nested directory reported once', nested.writeStatus.includes('[OK] a/b/c/d'));

    const order = await processMarkers(
      '[[MKDIR:generated]]\n[WRITE_FILE: generated/a.txt]\nhi\n[/WRITE_FILE]', ws,
    );
    check('mkdir runs before write_file',
      order.writeStatus.indexOf('[DIR]') < order.writeStatus.indexOf('[FILES]'));
    check('file written inside the created directory',
      existsSync(join(root, 'generated', 'a.txt')));

    const dailyResult = await processMarkers('[[MKDIR:daily-dir]]', daily);
    check('daily mode refuses mkdir', !existsSync(join(root, 'daily-dir')));
    check('daily mode explains the refusal',
      dailyResult.writeStatus.includes(DAILY_DISABLED));
    check('daily mode counts the rejected marker', dailyResult.rejectedCount === 1);

    const escape = await processMarkers('[[MKDIR:../apex-mkdir-escape]]', ws);
    check('traversal is refused', !existsSync(ESCAPE_DIR));
    check('traversal is counted as rejected', escape.rejectedCount === 1);

    const protectedDir = await processMarkers('[[MKDIR:.git]]', ws);
    check('protected .git is refused', !existsSync(join(root, '.git')));
    check('protected path is counted as rejected', protectedDir.rejectedCount === 1);

    const tooMany = Array.from({ length: 11 }, (_: number, i: number): string =>
      `[[MKDIR:d${i}]]`).join('\n');
    const capped = await processMarkers(tooMany, ws);
    check('more than ten directories: none created', !existsSync(join(root, 'd0')));
    check('limit breach is reported', capped.writeStatus.includes('تجاوز الحد'));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ESCAPE_DIR, { recursive: true, force: true });
  }
  finish();
}

main().catch((err: unknown) => {
  console.error('MKDIR test failed:', err);
  process.exit(1);
});
