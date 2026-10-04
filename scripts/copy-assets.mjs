import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const assets = [
  { from: 'src/memory/schema.sql', to: 'dist/memory/schema.sql' },
];

for (const { from, to } of assets) {
  if (!existsSync(from)) {
    console.error(`Missing asset: ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  console.log(`Copied: ${from} → ${to}`);
}
