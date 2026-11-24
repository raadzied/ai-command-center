import type { RunScope } from '../src/types.js';
import { createSharedBoard } from '../src/core/shared-board.js';
import { check, finish } from './test-db-helpers.js';

function workspaceScope(windowId: number | null): RunScope {
  return {
    kind: 'workspace',
    windowId,
    projectId: windowId === null ? null : 10 + windowId,
    sessionId: null,
    workspaceRoot: 'C:\\workspace\\demo',
  };
}

function main(): void {
  console.log('=== STEP 82B - SharedBoard Test ===\n');

  const winA = createSharedBoard(workspaceScope(1), 'run-a');
  const winB = createSharedBoard(workspaceScope(2), 'run-b');
  const cli = createSharedBoard(workspaceScope(null), 'run-cli');

  check('run ids are per instance', winA.runId === 'run-a' && winB.runId === 'run-b');
  check('window ids are distinct', winA.scope.windowId === 1 && winB.scope.windowId === 2);

  winA.post('coder', 'file', 'src/a.ts');
  winB.post('coder', 'file', 'src/b.ts');
  cli.post('commander', 'plan', 'step 1');

  check('window A keeps its own value', winA.get('file') === 'src/a.ts');
  check('window B keeps its own value', winB.get('file') === 'src/b.ts');
  check(
    'CLI board isolated from both windows',
    winA.get('plan') === null && winB.get('plan') === null,
  );
  check('CLI value preserved', cli.get('plan') === 'step 1');
  check('missing key returns null', winA.get('missing') === null);
  check('list returns a defensive copy', winA.list() !== winA.list() && winA.list().length === 1);

  const snapshot = winA.snapshotText(40);
  check('snapshot includes key', snapshot.includes('[file]'));
  check('snapshot respects maxChars', snapshot.length <= 40);
  check('snapshot truncates large input', winA.snapshotText(5).length === 5);

  winA.dispose();
  check('dispose flagged', winA.isDisposed());
  let blocked = false;
  try {
    winA.post('coder', 'late', 'value');
  } catch {
    blocked = true;
  }
  check('write after dispose rejected', blocked);
  check('other boards remain writable', ((): boolean => {
    winB.post('advisor', 'note', 'ok');
    return winB.get('note') === 'ok';
  })());

  finish();
}

main();
