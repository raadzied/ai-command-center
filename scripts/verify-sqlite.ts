import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

function main(): void {
  // 1) افتح DB في الذاكرة (لا نلمس القرص بعد)
  const db = new Database(':memory:');
  console.log('✓ better-sqlite3 opened in-memory DB');

  // 2) حمّل sqlite-vec
  sqliteVec.load(db);
  console.log('✓ sqlite-vec loaded');

  // 3) تحقق من الإصدار
  const version = db.prepare('SELECT vec_version() AS v').get() as { v: string };
  console.log(`✓ vec_version = ${version.v}`);

  // 4) أنشئ جدول vec0
  db.exec(`
    CREATE VIRTUAL TABLE test_vec USING vec0(
      id INTEGER PRIMARY KEY,
      embedding FLOAT[4]
    );
  `);
  console.log('✓ vec0 virtual table created');

  // 5) أدخل متجهين
  db.exec(`INSERT INTO test_vec(id, embedding) VALUES (1, '[0.1,0.2,0.3,0.4]')`);
  db.exec(`INSERT INTO test_vec(id, embedding) VALUES (2, '[0.9,0.8,0.7,0.6]')`);
  console.log('✓ 2 vectors inserted');

  // 6) ابحث بأقرب جار
  const query = db.prepare(`
    SELECT id, distance FROM test_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT 1
  `);
  const result = query.get(JSON.stringify([0.1, 0.2, 0.3, 0.4])) as
    { id: number; distance: number };
  console.log(`✓ nearest neighbor: id=${result.id}, distance=${result.distance.toFixed(4)}`);

  if (result.id !== 1) {
    throw new Error('Expected id=1 as nearest, got ' + result.id);
  }

  // 7) نظّف
  db.close();
  console.log('✓ DB closed');
  console.log('\nALL CHECKS PASSED — sqlite stack is ready.');
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error('VERIFICATION FAILED:');
  console.error(err);
  process.exit(1);
}