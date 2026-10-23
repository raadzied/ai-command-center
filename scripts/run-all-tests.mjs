import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

// قوائم صريحة — لا اكتشاف ديناميكي
const UNIT_TESTS = [
  'src/llm/classifier.cloud.test.ts',
  'scripts/test-approval.ts',
  'scripts/test-topological.ts',
  'scripts/test-markers.ts',
  'scripts/test-chat-fallback.ts',
  'scripts/test-essence.ts',
  'scripts/test-tsc-validate.ts',
  'scripts/test-registry.ts',
  'scripts/test-build-start.mjs',
  'scripts/test-filesystem-security.ts',
  'scripts/test-task-failure.ts',
];

const LIVE_TESTS = [
  'scripts/test-router.ts',
  'scripts/test-decomposer.ts',
  'scripts/test-memory.ts',
  'scripts/test-mentor.ts',
  'scripts/test-agents.ts',
  'scripts/e2e-v2.ts',
  'scripts/test-quality-gate.ts',
  'scripts/test-tts.ts',
];

function runSuite(label, files) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label} (${files.length} files)`);
  console.log(`${'='.repeat(60)}\n`);

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`  ❌ MISSING: ${file}`);
      failed++;
      continue;
    }

    console.log(`\n─── ${file} ───`);

    const r = spawnSync(
      process.execPath,
      ['--import', 'tsx', file],
      { stdio: 'inherit', shell: false }
    );

    if (r.status === 0) {
      passed++;
    } else {
      failed++;
      console.error(`  ❌ FAILED: ${file} (exit ${r.status})`);
    }
  }

  console.log(`\n${label}: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

function main() {
  const args = process.argv.slice(2);
  const liveMode = args.includes('--live');

  console.log('\n=== AI Command Center — Test Runner ===');
  console.log(`Mode: ${liveMode ? 'unit + live' : 'unit only'}\n`);

  const unitResult = runSuite('UNIT TESTS (no API)', UNIT_TESTS);

  let liveResult = { passed: 0, failed: 0 };
  if (liveMode) {
    console.log('\n⚠️  Live tests require API keys and consume quota.');
    liveResult = runSuite('LIVE TESTS (real API)', LIVE_TESTS);
  }

  const totalPassed = unitResult.passed + liveResult.passed;
  const totalFailed = unitResult.failed + liveResult.failed;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TOTAL: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`${'='.repeat(60)}\n`);

  if (!liveMode) {
    console.log('ℹ️  Live tests skipped. Run "npm run test:live" to include them.\n');
  }

  process.exit(totalFailed === 0 ? 0 : 1);
}

main();