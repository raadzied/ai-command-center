import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../src/memory/db.js';
import {
  readProjectFile,
  writeProjectFile,
} from '../src/tools/filesystem.js';

const TMP_DIR = join('data', 'test-fs-tmp');
const OUTSIDE_FILE = join(tmpdir(), `ai-cc-outside-${Date.now()}.txt`);
const LINK_NAME = join(TMP_DIR, 'link-outside.txt');

async function main(): Promise<void> {
  const DB_DIR = mkdtempSync(join(tmpdir(), 'ai-cc-fs-test-'));
  initDb(join(DB_DIR, 'test.db'));
  console.log('=== Filesystem Security Test ===\n');
  let passed = 0;
  const total = 4;

  try {
    await mkdir(TMP_DIR, { recursive: true });

    // 1) مسار عادي: كتابة ثم قراءة
    const written = await writeProjectFile(
      join(TMP_DIR, 'file.txt'),
      'hello',
    );
    assert.equal(written.executed, true);
    const readBack = await readProjectFile(join(TMP_DIR, 'file.txt'));
    assert.equal(readBack.executed, true);
    assert.equal(readBack.result, 'hello');
    console.log('✓ مسار عادي: كتابة وقراءة');
    passed++;

    // 2) traversal خارج المشروع → يرمي قبل التنفيذ (fail-fast:
    // الفحص يسبق التصنيف والموافقة عمدًا حتى لا يُسجَّل auto_approved مضلل)
    await assert.rejects(
      () => writeProjectFile('../../../etc/passwd', 'x'),
      /outside project/i,
    );
    console.log('✓ traversal يُرفض');
    passed++;

    // 3) مسار مطلق خارج المشروع → نتيجة خطأ (الفحص داخل المنفذ)
    const absolute = await readProjectFile('C:/Windows/x');
    assert.equal(absolute.executed, false);
    assert.match(absolute.error ?? '', /outside project/i);
    console.log('✓ مسار مطلق خارجي يُرفض');
    passed++;

    // 4) symlink يشير خارج المشروع → نتيجة خطأ (الفحص داخل المنفذ)
    await writeFile(OUTSIDE_FILE, 'secret', 'utf-8');
    await symlink(OUTSIDE_FILE, LINK_NAME, 'file');
    const viaLink = await readProjectFile(LINK_NAME);
    assert.equal(viaLink.executed, false);
    assert.match(viaLink.error ?? '', /Symlink escape|outside project/i);
    console.log('✓ symlink escape يُرفض');
    passed++;
  } finally {
    await rm(TMP_DIR, { recursive: true, force: true });
    await rm(OUTSIDE_FILE, { force: true });
    closeDb();
    rmSync(DB_DIR, { recursive: true, force: true });
  }

  console.log(`\n=== ${passed}/${total} passed ===`);
  process.exitCode = passed === total ? 0 : 1;
}

main().catch((err) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
