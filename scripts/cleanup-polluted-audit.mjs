import Database from 'better-sqlite3';
import { resolve } from 'node:path';

const DB_PATH = resolve(process.cwd(), 'data', 'memory.db');

// أنماط الملوّثات المعروفة
const PATTERNS = [
  { target: 'data\\test-fs-tmp\\file.txt', action: 'file_write' },
  { target: 'data\\test-fs-tmp\\file.txt', action: 'file_read' },
  { target: 'C:/Windows/x', action: 'file_read' },
  { target: 'data\\test-fs-tmp\\link-outside.txt', action: 'file_read' },
];

function main() {
  const confirm = process.argv.includes('--confirm');
  const db = new Database(DB_PATH, { readonly: !confirm });

  console.log(`DB: ${DB_PATH}`);
  console.log(`Mode: ${confirm ? 'DELETE' : 'DRY RUN'}\n`);

  let totalFound = 0;

  for (const p of PATTERNS) {
    const rows = db.prepare(
      `SELECT id, timestamp FROM audit_log
       WHERE target = ? AND action_type = ?`
    ).all(p.target, p.action);

    if (rows.length === 0) {
      console.log(`  ✓ not found: ${p.action} → ${p.target}`);
      continue;
    }

    console.log(`  🔴 ${rows.length} row(s): ${p.action} → ${p.target}`);
    for (const r of rows) {
      console.log(`     id=${r.id} @ ${r.timestamp}`);
    }
    totalFound += rows.length;
  }

  console.log(`\nTotal to delete: ${totalFound}`);

  if (totalFound === 0) {
    db.close();
    console.log('\n✓ Nothing to clean.\n');
    return;
  }

  if (!confirm) {
    db.close();
    console.log('\n⚠️  DRY RUN — to actually delete, run:');
    console.log('    node scripts/cleanup-polluted-audit.mjs --confirm\n');
    return;
  }

  // حذف + تحقق
  const deleteStmt = db.prepare(
    'DELETE FROM audit_log WHERE target = ? AND action_type = ?'
  );
  let deleted = 0;

  const tx = db.transaction(() => {
    for (const p of PATTERNS) {
      const result = deleteStmt.run(p.target, p.action);
      deleted += result.changes;
    }
  });
  tx();

  db.close();
  console.log(`\n✅ Deleted ${deleted} row(s).\n`);
}

main();