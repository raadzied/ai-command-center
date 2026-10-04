import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';

// ملفات مؤقتة معروفة من الاختبارات اليدوية (STEP 30-32 وما قبلها)
const LEFTOVERS = [
  'hello-tool.ts', 'test-output.txt', 'calculator.ts', 'calculator.test.ts',
  'a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts',
  'f1.ts', 'f2.ts', 'f3.ts', 'f4.ts', 'f5.ts', 'f6.ts',
  'tsc-out.txt', 'tsc-output.txt', 'install.log',
  'src/new-file.ts',
  'data/test-memory.db', 'data/test-memory.db-wal', 'data/test-memory.db-shm',
  'data/test.db', 'data/test.db-wal', 'data/test.db-shm',
];

// ملفات data/ الآمنة (لا تُعرض ولا تُحذف أبدًا)
const DATA_SAFE = new Set([
  'memory.db', 'memory.db-wal', 'memory.db-shm',
  'e2e-v2-1790346497615.json', 'e2e-v2-1790347459094.json',
]);

function findExisting() {
  return LEFTOVERS.filter((f) => existsSync(f));
}

function listDataDirExtras() {
  if (!existsSync('data')) return [];
  return readdirSync('data').filter((n) => !DATA_SAFE.has(n));
}

function main() {
  const confirmed = process.argv.slice(2).includes('--confirm');
  console.log('=== Cleanup Leftovers ===\n');
  const files = findExisting();
  const dataExtras = listDataDirExtras();
  if (files.length === 0 && dataExtras.length === 0) {
    console.log('✓ No leftovers found. Project is clean.');
    process.exit(0);
  }
  console.log('Leftover candidates:');
  for (const f of files) {
    console.log(`  • ${f} (${statSync(f).size} bytes)`);
  }
  if (dataExtras.length > 0) {
    console.log('\ndata/ extras (not in safe list):');
    for (const f of dataExtras) console.log(`  • data/${f}`);
  }
  if (!confirmed) {
    console.log('\n⚠️  DRY RUN. To actually delete, run:');
    console.log('    node scripts/cleanup-leftovers.mjs --confirm');
    process.exit(0);
  }
  console.log('\nDeleting...');
  let removed = 0;
  for (const f of files) {
    try {
      rmSync(f, { force: true });
      console.log(`  ✓ removed ${f}`);
      removed++;
    } catch (err) {
      console.error(`  ✗ failed ${f}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nDone. Removed ${removed}/${files.length} files.`);
  process.exit(0);
}

main();