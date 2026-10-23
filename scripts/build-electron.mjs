import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function run(label, args) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    shell: false,
    cwd: ROOT,
  });
  return r.status ?? 1;
}

if (run('tsc', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.electron.json']) !== 0) process.exit(1);
if (run('vite build', ['node_modules/vite/bin/vite.js', 'build', '--config', 'src/electron/renderer/vite.config.ts']) !== 0) process.exit(1);

const assets = [{ from: 'src/memory/schema.sql', to: 'dist-electron/memory/schema.sql' }];
for (const { from, to } of assets) {
  const src = resolve(ROOT, from);
  const dst = resolve(ROOT, to);
  if (!existsSync(src)) { console.error(`❌ MISSING: ${src}`); process.exit(1); }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`✓ ${from} → ${to}`);
}

console.log('\n✅ Build complete');
