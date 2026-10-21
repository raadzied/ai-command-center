import 'dotenv/config';
import {
  extractWriteInstructions,
  extractWriteInstruction,
  countWriteMarkers,
} from '../src/tools/markers.js';

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

function main(): void {
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


  // === processMarkers path validation (حسابي، بلا كتابة) ===
  console.log('\n=== processMarkers path validation ===\n');

  const testCases = [
    {
      label: 'src/ مسموح',
      marker: '[WRITE_FILE: src/valid.ts]\nx\n[/WRITE_FILE]',
      expectedWrote: 1,
      expectedRejected: 0,
    },
    {
      label: 'الجذر ممنوع',
      marker: '[WRITE_FILE: bad.ts]\nx\n[/WRITE_FILE]',
      expectedWrote: 0,
      expectedRejected: 1,
    },
    {
      label: 'package.json مسموح',
      marker: '[WRITE_FILE: package.json]\n{}\n[/WRITE_FILE]',
      expectedWrote: 1,
      expectedRejected: 0,
    },
    {
      label: 'مسارات مختلطة',
      marker: '[WRITE_FILE: src/a.ts]\nx\n[/WRITE_FILE]\n' +
              '[WRITE_FILE: evil.ts]\ny\n[/WRITE_FILE]',
      expectedWrote: 1,
      expectedRejected: 1,
    },
  ];

  let pathTestsPassed = 0;
  for (const tc of testCases) {
    const instructions = extractWriteInstructions(tc.marker);
    let allowed = 0;
    let rejected = 0;
    for (const inst of instructions) {
      const normalized = inst.path.replace(/\\/g, '/');
      const ok =
        normalized.startsWith('src/') ||
        normalized.startsWith('scripts/') ||
        normalized.startsWith('data/') ||
        ['package.json', 'tsconfig.json', 'README.md',
         'AGENTS.md', 'ARCHITECTURE.md', '.gitignore']
          .includes(normalized);
      if (ok) allowed++;
      else rejected++;
    }
    const pass =
      allowed === tc.expectedWrote &&
      rejected === tc.expectedRejected;
    console.log(`${pass ? '✓' : '✗'} ${tc.label} (allowed=${allowed}, rejected=${rejected})`);
    if (pass) pathTestsPassed++;
  }

  console.log(`\n=== Path tests: ${pathTestsPassed}/${testCases.length} ===`);
  if (pathTestsPassed !== testCases.length) {
    process.exit(1);
  }

  const total = CASES.length + 2;
  console.log(`=== ${passed}/${total} passed ===`);
  process.exit(passed === total ? 0 : 1);
}

main();
