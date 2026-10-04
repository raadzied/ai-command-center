import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

function runSync(label, cmd, args) {
  return new Promise((resolve) => {
    console.log(`\n$ ${label}`);
    const r = spawn(cmd, args, {
      stdio: 'inherit',
      shell: false,
    });
    r.on('exit', (code) => resolve(code ?? 1));
  });
}

function runInteractive(label, cmd, args, delayMs, timeoutMs) {
  return new Promise((resolve) => {
    console.log(`\n$ ${label}`);
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: false,
    });

    const killTimer = setTimeout(() => {
      console.error(`❌ Timeout after ${timeoutMs}ms`);
      child.kill();
      resolve(1);
    }, timeoutMs);

    // أعطِ التطبيق وقتًا ليجهز readline قبل إرسال /exit
    setTimeout(() => {
      child.stdin.write('/exit\n');
      child.stdin.end();
    }, delayMs);

    child.on('exit', (code) => {
      clearTimeout(killTimer);
      resolve(code ?? 1);
    });
  });
}

async function main() {
  console.log('=== Build → Start Test ===\n');

  const tscExit = await runSync(
    'tsc (via node)',
    process.execPath,
    ['node_modules/typescript/bin/tsc'],
  );
  if (tscExit !== 0) { console.error('❌ tsc failed'); process.exit(1); }
  console.log('✓ tsc compiled');

  const copyExit = await runSync(
    'copy-assets',
    process.execPath,
    ['scripts/copy-assets.mjs'],
  );
  if (copyExit !== 0) { console.error('❌ copy-assets failed'); process.exit(1); }

  if (!existsSync('dist/memory/schema.sql')) {
    console.error('❌ dist/memory/schema.sql missing');
    process.exit(1);
  }
  console.log('✓ dist/memory/schema.sql present');

  if (!existsSync('dist/index.js')) {
    console.error('❌ dist/index.js missing');
    process.exit(1);
  }
  console.log('✓ dist/index.js present');

  const startExit = await runInteractive(
    'dist/index.js',
    process.execPath,
    ['dist/index.js'],
    3000,
    30000,
  );

  if (startExit !== 0) {
    console.error(`❌ dist/index.js exited with ${startExit}`);
    process.exit(1);
  }

  console.log('\n✅ Build → Start OK');
  process.exit(0);
}

main();