import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const ASSETS = [
  {
    from: 'src/memory/schema.sql',
    to: 'dist-electron/memory/schema.sql',
  },
];

let copied = 0;
let missing = 0;

for (const { from, to } of ASSETS) {
  if (!existsSync(from)) {
    console.error(`❌ MISSING: ${from}`);
    missing++;
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`✓ ${from} → ${to}`);
  copied++;
}

console.log(`\nCopied ${copied}, missing ${missing}`);
process.exit(missing > 0 ? 1 : 0);
