import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

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

/** Fails the build before copying if preload.cjs cannot be parsed. */
function assertPreloadSyntax(relPath) {
  const file = resolve(ROOT, relPath);
  if (!existsSync(file)) {
    console.error(`[FAIL] MISSING: ${file}`);
    process.exit(1);
  }
  const code = readFileSync(file, 'utf8');
  try {
    new Script(code, { filename: relPath });
  } catch (err) {
    const detail = err instanceof Error
      ? String(err.stack ?? err.message).split('\n').slice(0, 5).join('\n')
      : String(err);
    console.error(`[FAIL] preload syntax error:\n${detail}`);
    process.exit(1);
  }
  console.log(`[OK] preload syntax: ${relPath}`);
}

assertPreloadSyntax('src/electron/preload.cjs');

if (run('tsc', ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.electron.json']) !== 0) process.exit(1);
if (run('tsc (renderer)', ['node_modules/typescript/bin/tsc', '-p', 'src/electron/renderer/tsconfig.json', '--noEmit']) !== 0) process.exit(1);
if (run('vite build', ['node_modules/vite/bin/vite.js', 'build', '--config', 'src/electron/renderer/vite.config.ts']) !== 0) process.exit(1);

const assets = [{ from: 'src/memory/schema.sql', to: 'dist-electron/memory/schema.sql' }];
const outputs = [
  ...assets,
  { from: 'src/electron/preload.cjs', to: 'dist-electron/electron/preload.cjs' },
];
for (const { from, to } of outputs) {
  const src = resolve(ROOT, from);
  const dst = resolve(ROOT, to);
  if (!existsSync(src)) { console.error(`[FAIL] MISSING: ${src}`); process.exit(1); }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`[OK] ${from} -> ${to}`);
}

console.log('\nBuild complete');
