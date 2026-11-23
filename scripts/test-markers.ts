import 'dotenv/config';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractWriteInstructions,
  extractWriteInstruction,
  countWriteMarkers,
  processMarkers,
} from '../src/tools/markers.js';
import { DAILY_DISABLED } from '../src/tools/filesystem.js';
import type { RunScope } from '../src/types.js';

interface Case {
  label: string;
  input: string;
  expectCount: number;
  expectPaths: string[];
}

const CASES: Case[] = [
  {
    label: 'marker بسيط',
    input: 'شرح\n[WRITE_FILE: hello.ts]\nconsole.log("hi");\n[/WRITE_FILE]',
    expectCount: 1,
    expectPaths: ['hello.ts'],
  },
  {
    label: 'marker مع مسافات في المسار',
    input: 'x\n[WRITE_FILE:   src/file.ts   ]\nlet a = 1;\n[/WRITE_FILE]',
    expectCount: 1,
    expectPaths: ['src/file.ts'],
  },
  {
    label: 'بدون marker',
    input: 'شرح فقط بلا marker',
    expectCount: 0,
    expectPaths: [],
  },
  {
    label: 'marker غير مغلق',
    input: '[WRITE_FILE: a.ts]\ncontent without closing',
    expectCount: 0,
    expectPaths: [],
  },
  {
    label: 'محتوى متعدد الأسطر',
    input: '[WRITE_FILE: multi.ts]\nline1\nline2\nline3\n[/WRITE_FILE]',
    expectCount: 1,
    expectPaths: ['multi.ts'],
  },
  {
    label: 'محتوى يحتوي أقواس',
    input: '[WRITE_FILE: obj.ts]\nconst x = {a: [1,2]};\n[/WRITE_FILE]',
    expectCount: 1,
    expectPaths: ['obj.ts'],
  },
  {
    label: 'marker متعدد (2)',
    input:
      '[WRITE_FILE: a.ts]\nlet a = 1;\n[/WRITE_FILE]\n\n' +
      'شرح بين الملفات\n\n' +
      '[WRITE_FILE: b.ts]\nlet b = 2;\n[/WRITE_FILE]',
    expectCount: 2,
    expectPaths: ['a.ts', 'b.ts'],
  },
  {
    label: 'marker متعدد (4)',
    input:
      '[WRITE_FILE: f1.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f2.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f3.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f4.ts]\nx\n[/WRITE_FILE]',
    expectCount: 4,
    expectPaths: ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts'],
  },
  {
    label: 'marker متعدد (6) — يتجاوز الحد',
    input:
      '[WRITE_FILE: f1.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f2.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f3.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f4.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f5.ts]\nx\n[/WRITE_FILE]\n' +
      '[WRITE_FILE: f6.ts]\nx\n[/WRITE_FILE]',
    expectCount: 6,
    expectPaths: ['f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts'],
  },
];

async function main(): Promise<void> {
  console.log('=== Marker Parser Test (multi) ===\n');
  let passed = 0;

  for (const c of CASES) {
    const results = extractWriteInstructions(c.input);
    const paths = results.map((r) => r.path);
    const countOk = results.length === c.expectCount;
    const pathsOk =
      c.expectPaths.length === paths.length &&
      c.expectPaths.every((p, idx) => paths[idx] === p);
    const ok = countOk && pathsOk;

    console.log(`${ok ? '✓' : '✗'} ${c.label}`);
    console.log(`   extracted: ${results.length} [${paths.join(', ')}]`);
    if (!ok) {
      console.log(`   expected: ${c.expectCount} [${c.expectPaths.join(', ')}]`);
    }
    console.log('');

    if (ok) passed++;
  }

  // توافق STEP 31: الدالة المفردة تعيد الأول
  const multi =
    '[WRITE_FILE: a.ts]\nx\n[/WRITE_FILE] text [WRITE_FILE: b.ts]\ny\n[/WRITE_FILE]';
  const first = extractWriteInstruction(multi);
  const singularOk = first?.path === 'a.ts';
  console.log(`${singularOk ? '✓' : '✗'} singular compat: ${first?.path ?? 'null'} (متوقع a.ts)`);
  if (singularOk) passed++;
  console.log('');

  // countWriteMarkers كتوافق
  const count = countWriteMarkers(multi);
  const countOk = count === 2;
  console.log(`${countOk ? '✓' : '✗'} countWriteMarkers: ${count} (متوقع 2)`);
  if (countOk) passed++;
  console.log('');


  // === processMarkers: الحدود الحقيقية (كتابة فعلية في مجلد مؤقت) ===
  console.log('\n=== processMarkers scope & boundaries ===\n');

  const tmpRoot = mkdtempSync(join(tmpdir(), 'ai-cc-markers-'));
  const wsScope: RunScope = {
    kind: 'workspace', windowId: null, projectId: 1, sessionId: null,
    workspaceRoot: tmpRoot,
  };
  const dailyScope: RunScope = { kind: 'daily', windowId: null, sessionId: null };
  let scopePassed = 0;

  // 1) مجلد مشروع باسم app/ يُقبل (لا قائمة مسموحات صلبة)
  const appResult = await processMarkers(
    '[WRITE_FILE: app/index.ts]\nexport const ok = 1;\n[/WRITE_FILE]',
    wsScope,
  );
  const appOk =
    appResult.wroteCount === 1 &&
    appResult.rejectedCount === 0 &&
    existsSync(join(tmpRoot, 'app', 'index.ts'));
  console.log(`${appOk ? '✓' : '✗'} app/index.ts يُكتب داخل المشروع`);
  if (appOk) scopePassed++;

  // 2) الوضع اليومي: لا كتابة على القرص + رسالة واضحة
  const dailyResult = await processMarkers(
    '[WRITE_FILE: daily.ts]\nx\n[/WRITE_FILE]',
    dailyScope,
  );
  const dailyOk =
    dailyResult.wroteCount === 0 &&
    dailyResult.writeStatus.includes(DAILY_DISABLED) &&
    !existsSync(join(tmpRoot, 'daily.ts'));
  console.log(`${dailyOk ? '✓' : '✗'} daily: يرفض الكتابة برسالة واضحة`);
  if (dailyOk) scopePassed++;

  // 3) الخروج عن جذر المشروع يُرفض وقت الكتابة (assertInsideProject)
  const escapeResult = await processMarkers(
    '[WRITE_FILE: ../outside.ts]\nx\n[/WRITE_FILE]',
    wsScope,
  );
  const escapeOk =
    escapeResult.wroteCount === 0 && escapeResult.rejectedCount === 1;
  console.log(`${escapeOk ? '✓' : '✗'} traversal يُرفض وقت الكتابة`);
  if (escapeOk) scopePassed++;

  rmSync(tmpRoot, { recursive: true, force: true });
  console.log(`\n=== Scope tests: ${scopePassed}/3 ===`);
  if (scopePassed !== 3) {
    process.exit(1);
  }

  const total = CASES.length + 2;
  console.log(`=== ${passed}/${total} passed ===`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
