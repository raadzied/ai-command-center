import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// فحص البيئة أولًا: cmd.exe المحجوبة تفشل فيها الكتابة
const shellCheck = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/detect-restricted-shell.ts'],
  { stdio: 'inherit' },
);
if (shellCheck.status !== 0) {
  console.error('Restricted shell detected. Aborting.');
  process.exit(1);
}

const roots = ['src', 'scripts'];
const tests = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) walk(full);
    else if (
      entry.endsWith('.test.ts') ||
      entry.startsWith('test-') && entry.endsWith('.ts')
    ) {
      tests.push(full);
    }
  }
}

for (const r of roots) {
  try {
    walk(r);
  } catch (err) {
    console.warn(`Skipping unreadable dir: ${r}`, err);
  }
}

if (tests.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

console.log(`Running ${tests.length} test file(s)...\n`);

let passed = 0;
let failed = 0;

for (const file of tests) {
  console.log(`\n─── ${file} ───`);
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', file],
    { stdio: 'inherit', shell: false }
  );
  if (r.status === 0) passed++;
  else { failed++; console.error(`FAILED: ${file}`); }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
