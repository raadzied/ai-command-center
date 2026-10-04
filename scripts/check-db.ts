import { openDb, closeDb } from '../src/memory/db.js';
import { rmSync, existsSync } from 'node:fs';

// نظّف أي ملف سابق
if (existsSync('./data/test.db')) {
  rmSync('./data/test.db', { force: true });
  rmSync('./data/test.db-wal', { force: true });
  rmSync('./data/test.db-shm', { force: true });
}

const db = openDb('./data/test.db');

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
  )
  .all() as Array<{ name: string }>;

console.log('Tables:');
for (const t of tables) console.log('  -', t.name);

const ver = db.prepare('SELECT vec_version() AS v').get() as { v: string };
console.log('vec_version:', ver.v);

closeDb();
console.log('OK');