// STEP 78-FIX — a reviewer outage must not cancel valid output or its markers.

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context, QualityResult, RunScope, Task } from '../src/types.js';
import { runTask } from '../src/core/task-runner.js';
import type { TaskRunnerDeps } from '../src/core/task-runner.js';
import { processMarkers } from '../src/tools/markers.js';
import { check, finish } from './test-db-helpers.js';

function reviewerOutage(): QualityResult {
  return {
    status: 'REVIEW_ERROR',
    score: 0,
    issues: [],
    summary: 'Review unavailable: All Groq chat models failed',
  };
}

async function main(): Promise<void> {
  console.log('=== STEP 78-FIX — Degraded Reviewer Test ===\n');
  const root = mkdtempSync(join(tmpdir(), 'apex-review-degraded-'));
  const scope: RunScope = {
    kind: 'workspace', windowId: null, projectId: 1, sessionId: null,
    workspaceRoot: root,
  };
  const context: Context = { memories: [], scope };
  const task: Task = {
    id: 't-degraded',
    description: 'أنشئ مجلد out وملفاً داخله',
    intent: 'build',
    agentName: 'coder',
    status: 'pending',
    verificationRequired: true,
    dependsOn: [],
  };

  const deps: TaskRunnerDeps = {
    selectAgent: () => ({
      name: 'coder',
      execute: async (): Promise<{ content: string }> => ({
        content: '[[MKDIR:out]]\n[WRITE_FILE: out/ok.txt]\nhello\n[/WRITE_FILE]',
      }),
    }),
    evaluateQuality: async (): Promise<QualityResult> => reviewerOutage(),
    processMarkers: (text, signal, onPhase) => processMarkers(text, scope, signal, onPhase),
    scope,
    enqueueSpeech: (): void => {},
  };

  try {
    const result = await runTask(deps, { task, index: 0, total: 1, context, prevOutput: '' });
    check('task completes despite reviewer outage', result.summary.status === 'done');
    check('task is flagged unverified', result.unverified);
    check('directory created despite reviewer outage', existsSync(join(root, 'out')));
    check('file written despite reviewer outage', existsSync(join(root, 'out', 'ok.txt')));
    check('no failure banner in rendered output', !result.rendered.includes('[FAIL]'));

    const emptyDeps: TaskRunnerDeps = {
      ...deps,
      selectAgent: () => ({
        name: 'coder',
        execute: async (): Promise<{ content: string }> => ({ content: '   ' }),
      }),
    };
    const empty = await runTask(emptyDeps, { task, index: 0, total: 1, context, prevOutput: '' });
    check('empty output still fails when verification is required', empty.summary.status === 'failed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  finish();
}

main().catch((err: unknown) => {
  console.error('Degraded reviewer test failed:', err);
  process.exit(1);
});
