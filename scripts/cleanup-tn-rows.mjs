import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), 'data', 'memory.db');
const PATTERN = '[t%]%'; // يطابق [t1], [t2], ...

function main() {
  const confirm = process.argv.includes('--confirm');
  const db = new Database(DB_PATH, { readonly: !confirm });

  console.log(`DB: ${DB_PATH}`);
  console.log(`Mode: ${confirm ? 'DELETE' : 'DRY RUN'}\n`);

  // عدّ
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM conversations
     WHERE role = 'user' AND content LIKE ?`,
  ).get(PATTERN);
  const count = row?.c ?? 0;

  console.log(`Found: ${count} [tN] user rows`);

  if (count === 0) {
    db.close();
    console.log('\n✓ Nothing to clean.\n');
    return;
  }

  // عيّنة (3 صفوف)
  const sample = db.prepare(
    `SELECT id, substr(content, 1, 60) AS preview FROM conversations
     WHERE role = 'user' AND content LIKE ?
     ORDER BY id DESC LIMIT 3`,
  ).all(PATTERN);

  console.log('\nSample (last 3):');
  for (const r of sample) {
    console.log(`  id=${r.id}: ${r.preview}`);
  }

  // ملاحظة: agent rows ليس لها معرّف مباشر — نحذف [tN] user فقط.
  // الصفوف المقابلة (agent) تبقى.

  if (!confirm) {
    db.close();
    console.log('\n⚠️  DRY RUN — to actually delete, run:');
    console.log('    node scripts/cleanup-tn-rows.mjs --confirm\n');
    return;
  }

  const result = db.prepare(
    `DELETE FROM conversations
     WHERE role = 'user' AND content LIKE ?`,
  ).run(PATTERN);

  db.close();
  console.log(`\n✅ Deleted ${result.changes} row(s).\n`);
}

main();