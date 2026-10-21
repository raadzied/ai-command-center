import 'dotenv/config';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { validateTscFiles } from '../src/tools/tsc-validate.js';

function cleanup(files: string[]): void {
  for (const f of files) {
    try { rmSync(f, { force: true }); } catch { /* ignore */ }
  }
}

function main(): void {
  console.log('=== tsc-validate Test ===\n');
  const testDir = 'src/__tsc_test__';
  mkdirSync(testDir, { recursive: true });

  // 1) ملف صالح
  const goodFile = `${testDir}/good.ts`;
  writeFileSync(
    goodFile,
    'export const x: number = 42;\n',
    'utf-8',
  );

  console.log('--- Case 1: valid file ---');
  const r1 = validateTscFiles([goodFile]);
  console.log(`ok: ${r1.ok}, errors: ${r1.errors.length}`);
  const pass1 = r1.ok;
  console.log(pass1 ? '✓' : '✗');

  // 2) ملف بأخطاء
  const badFile = `${testDir}/bad.ts`;
  writeFileSync(
    badFile,
    'const y: number = "not a number";\nexport { y };\n',
    'utf-8',
  );

  console.log('\n--- Case 2: invalid file ---');
  const r2 = validateTscFiles([badFile]);
  console.log(`ok: ${r2.ok}, errors: ${r2.errors.length}`);
  for (const e of r2.errors.slice(0, 2)) {
    console.log(`  ${e}`);
  }
  const pass2 = !r2.ok && r2.errors.length > 0;
  console.log(pass2 ? '✓' : '✗');

  // 3) tsc binary مفقود → fail-closed
  console.log('\n--- Case 3: missing tsc binary ---');
  const r3 = validateTscFiles([goodFile], {
    tscPath: '/nonexistent/tsc',
  });
  console.log(`ok: ${r3.ok}, errors: ${r3.errors.length}`);
  if (r3.errors.length > 0) {
    console.log(`  ${r3.errors[0]}`);
  }
  const pass3 = !r3.ok && r3.errors.length > 0;
  console.log(pass3 ? '✓' : '✗');

  cleanup([goodFile, badFile]);
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }

  const total = (pass1 ? 1 : 0) + (pass2 ? 1 : 0) + (pass3 ? 1 : 0);
  console.log(`\n=== ${total}/3 passed ===`);
  process.exit(total === 3 ? 0 : 1);
}

main();