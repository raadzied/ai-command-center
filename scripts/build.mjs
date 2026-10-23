import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TSC = resolve('node_modules/typescript/bin/tsc');
const ASSETS = [
  { from: 'src/memory/schema.sql', to: 'dist/memory/schema.sql' },
];

function step(label, fn) {
  console.log(`\n▸ ${label}`);
  const code = fn();
  if (code !== 0) {
    console.error(`✗ ${label} failed (exit ${code})`);
    process.exit(code);
  }
  console.log(`✓ ${label}`);
}

if (existsSync('dist')) {
  console.log('▸ cleaning dist/');
  rmSync('dist', { recursive: true, force: true });
  console.log('✓ dist/ cleaned');
}

step('tsc compile', () => {
  const r = spawnSync(process.execPath, [TSC], {
    stdio: 'inherit',
    shell: false,
  });
  return r.status ?? 1;
});

step('copy assets', () => {
  for (const { from, to } of ASSETS) {
    if (!existsSync(from)) {
      console.error(`  missing: ${from}`);
      return 1;
    }
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    console.log(`  ${from} → ${to}`);
  }
  return 0;
});

console.log('\n✅ Build complete\n');