import 'dotenv/config';
import assert from 'node:assert/strict';
import { topologicalSort } from '../src/core/decomposer.js';
import type { Task } from '../src/types.js';

function makeTask(id: string, dependsOn: string[] = []): Task {
  return {
    id,
    description: `مهمة ${id}`,
    intent: 'build',
    agentName: 'coder',
    status: 'pending',
    verificationRequired: false,
    dependsOn,
  };
}

function ids(tasks: Task[]): string[] {
  return tasks.map((t) => t.id);
}

function main(): void {
  console.log('=== Topological Sort Test ===\n');
  let passed = 0;
  const total = 5;

  // 1) سلسلة خطية
  try {
    const out = ids(
      topologicalSort([
        makeTask('t1'),
        makeTask('t2', ['t1']),
        makeTask('t3', ['t2']),
      ]),
    );
    assert.deepEqual(out, ['t1', 't2', 't3']);
    console.log('✓ سلسلة خطية t1→t2→t3');
    passed++;
  } catch (err) {
    console.log('✗ سلسلة خطية', err);
  }

  // 2) تبعيات متعددة
  try {
    const out = ids(
      topologicalSort([
        makeTask('t1'),
        makeTask('t2'),
        makeTask('t3', ['t1', 't2']),
      ])
    );
    assert.equal(out[out.length - 1], 't3');
    assert.deepEqual([...out].sort(), ['t1', 't2', 't3']);
    console.log('✓ تبعيات متعددة (t3 أخيرًا)');
    passed++;
  } catch (err) {
    console.log('✗ تبعيات متعددة', err);
  }

  // 3) دورة → throw
  try {
    topologicalSort([makeTask('t1', ['t2']), makeTask('t2', ['t1'])]);
    console.log('✗ دورة: لم يرمِ');
  } catch (err) {
    assert.match(
      err instanceof Error ? err.message : String(err),
      /cycle/,
    );
    console.log('✓ دورة t1↔t2 تُرمى');
    passed++;
  }

  // 4) تبعية ناقصة → throw
  try {
    topologicalSort([makeTask('t1', ['t99'])]);
    console.log('✗ تبعية ناقصة: لم يرمِ');
  } catch (err) {
    assert.match(
      err instanceof Error ? err.message : String(err),
      /Missing dependency/,
    );
    console.log('✓ تبعية ناقصة t99 تُرمى');
    passed++;
  }

  // 5) بدون تبعيات → نفس الترتيب
  try {
    const out = ids(topologicalSort([makeTask('t1'), makeTask('t2')]));
    assert.deepEqual(out, ['t1', 't2']);
    console.log('✓ بدون تبعيات يحافظ على الترتيب');
    passed++;
  } catch (err) {
    console.log('✗ بدون تبعيات', err);
  }

  console.log(`\n=== ${passed}/${total} passed ===`);
  process.exit(passed === total ? 0 : 1);
}

main();
