import { createRunController, RunCancelledError, throwIfAborted } from '../src/core/run-control.js';
import { runTask } from '../src/core/task-runner.js';
import type { MarkerResult } from '../src/tools/markers.js';
import type { TaskAgent, TaskRunnerDeps } from '../src/core/task-runner.js';
import type { Context, QualityResult, Task } from '../src/types.js';

let passed = 0;
let failed = 0;

function check(label: string, value: boolean): void {
  if (value) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function task(): Task {
  return {
    id: 'cancel-task', description: 'write a file', intent: 'build', agentName: 'coder',
    status: 'pending', verificationRequired: false, dependsOn: [],
  };
}

async function main(): Promise<void> {
  const phases: string[] = [];
  const controller = createRunController((phase): void => phases.push(phase));
  controller.cancel();
  check('controller reports cancellation', controller.isCancelled());
  check('controller emits CANCELLED', phases.includes('CANCELLED'));

  let threw = false;
  try {
    throwIfAborted(controller.signal);
  } catch (error) {
    threw = error instanceof RunCancelledError;
  }
  check('aborted signal throws RunCancelledError', threw);

  const active = createRunController();
  let markersCalled = false;
  const deps: TaskRunnerDeps = {
    signal: active.signal,
    selectAgent: (): TaskAgent => ({
      name: 'coder',
      execute: async (): Promise<{ content: string }> => {
        active.cancel();
        return { content: '[WRITE_FILE: blocked.txt]\nblocked\n[/WRITE_FILE]' };
      },
    }),
    evaluateQuality: async (): Promise<QualityResult> => ({
      status: 'PASS', score: 1, issues: [], summary: 'not reached',
    }),
    processMarkers: async (): Promise<MarkerResult> => {
      markersCalled = true;
      return { cleanedContent: '', writeStatus: '', wroteCount: 0, rejectedCount: 0, totalMarkers: 0, wrotePaths: [] };
    },
    enqueueSpeech: (): void => {},
  };
  const context: Context = { memories: [] };
  let runCancelled = false;
  try {
    await runTask(deps, { task: task(), index: 0, total: 1, context, prevOutput: '' });
  } catch (error) {
    runCancelled = error instanceof RunCancelledError;
  }
  check('runTask propagates cancellation', runCancelled);
  check('cancellation prevents marker processing', !markersCalled);

  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown): void => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
