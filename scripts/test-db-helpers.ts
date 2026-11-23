import type Database from 'better-sqlite3';

/** أدوات مشتركة لاختبارات طبقة الذاكرة (لا تُشغَّل ضمن run-all-tests مباشرة). */

let passed = 0;
let failed = 0;

export function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.log(`✗ ${label}`);
  }
}

export function expectThrows(label: string, fn: () => void): void {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = err instanceof Error;
  }
  check(label, threw);
}

export function finish(): void {
  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exitCode = failed === 0 ? 0 : 1;
}

/** متجه 768 بُعدًا حتمي — بلا أي استدعاء API. */
export function makeVector(seed: number): number[] {
  const vec: number[] = [];
  let state = (seed * 2654435761) % 2147483647;
  for (let i = 0; i < 768; i += 1) {
    state = (state * 48271) % 2147483647;
    vec.push((state / 2147483647) * 2 - 1);
  }
  return vec;
}

export function readUserVersion(db: Database.Database): number {
  const value = db.pragma('user_version', { simple: true });
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare<[string], { present: number }>(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name);
  return row !== undefined;
}

export function hasIndex(db: Database.Database, name: string): boolean {
  const row = db
    .prepare<[string], { present: number }>(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'index' AND name = ?",
    )
    .get(name);
  return row !== undefined;
}

export function tableColumns(db: Database.Database, table: string): string[] {
  const rows = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

export function countRows(db: Database.Database, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number } | undefined;
  return row?.n ?? 0;
}
