import { readFileSync } from 'node:fs';
import { emitActivity } from '../src/core/hud-activity.js';
import type { HudActivityEvent } from '../src/core/hud-activity.js';
import { processInputScoped } from '../src/core/loop.js';
import type { LoopDeps } from '../src/core/loop.js';
import type { MarkerResult } from '../src/tools/markers.js';
import type { Context, QualityResult, Task } from '../src/types.js';
import { check, finish } from './test-db-helpers.js';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

async function main(): Promise<void> {
  console.log('=== STEP 83A - HUD Activity Test ===\n');

  const seen: HudActivityEvent[] = [];
  emitActivity((event): void => { seen.push(event); }, {
    nodeId: 'fs', state: 'active', detail: 'x'.repeat(200),
  });
  check('detail capped at 120 chars', seen[0]?.detail?.length === 120);

  let threwWithout = false;
  try {
    emitActivity(undefined, { nodeId: 'fs', state: 'idle' });
  } catch {
    threwWithout = true;
  }
  check('silent when emitter is absent', !threwWithout);

  let rethrew = false;
  try {
    emitActivity((): void => { throw new Error('emitter down'); }, {
      nodeId: 'fs', state: 'active',
    });
  } catch {
    rethrew = true;
  }
  check('emitter failure does not abort run', !rethrew);

  const context: Context = {
    memories: [{ id: 1, content: 'm', category: 'conversation' }],
    recentMessages: [{ role: 'user', agentName: null, content: 'hi' }],
  };
  const task: Task = {
    id: 't1', description: 'do work', intent: 'build', agentName: 'coder',
    status: 'pending', verificationRequired: false, dependsOn: [],
  };
  const events: HudActivityEvent[] = [];
  const deps: Partial<LoopDeps> = {
    buildMemoryContext: async (): Promise<Context> => context,
    createPlan: async () => ({ intent: 'build', isChat: false, tasks: [task] }),
    selectAgent: () => ({
      name: 'coder',
      execute: async (): Promise<{ content: string }> => ({ content: 'done' }),
    }),
    evaluateQuality: async (): Promise<QualityResult> => ({
      status: 'PASS', score: 1, issues: [], summary: 'ok',
    }),
    processMarkers: async (text): Promise<MarkerResult> => ({
      cleanedContent: text, writeStatus: '', wroteCount: 0,
      rejectedCount: 0, totalMarkers: 0, wrotePaths: [],
    }),
    enqueueSpeech: (): void => {},
    saveToMemory: async (): Promise<void> => {},
    onActivity: (event): void => { events.push(event); },
  };
  await processInputScoped('do work', { kind: 'daily', windowId: 1, sessionId: 1 }, deps);

  const ids = events.map((event): string => event.nodeId);
  check('sqlite emitted', ids.includes('sqlite'));
  check('context emitted', ids.includes('context'));
  check('orchestrator emitted', ids.includes('orchestrator'));
  check('agent node emitted', ids.includes('coder'));
  check('agent done emitted', events.some((e) => e.nodeId === 'coder' && e.state === 'done'));
  check(
    'telemetry emitted in finally',
    events.some((e) => e.nodeId === 'telemetry' && e.state === 'done'),
  );

  const inputIpc = read('src/electron/input-ipc.ts');
  const voiceIpc = read('src/electron/voice-ipc.ts');
  const preload = read('src/electron/preload.cjs');
  const windowTypes = read('src/electron/renderer/src/window.d.ts');
  const hudApi = read('src/electron/renderer/src/hud-api.d.ts');

  check(
    'input-ipc sends only to caller',
    !inputIpc.includes('BrowserWindow.getAllWindows') &&
      inputIpc.includes("event.sender.send('hud:activity', payload)"),
  );
  check('voice-ipc sends only to caller', !voiceIpc.includes('getAllWindows()'));
  check(
    'preload exposes onHudActivity',
    preload.includes("onHudActivity: (callback) => subscribe('hud:activity', callback)"),
  );
  check(
    'window declares onHudActivity',
    windowTypes.includes('onHudActivity: (cb: (event: HudActivityEvent) => void) => () => void;'),
  );
  check(
    'hud-api declares activity types',
    hudApi.includes('export type NodeActivityState') &&
      hudApi.includes('export interface HudActivityEvent'),
  );

  finish();
}

void main().catch((err: unknown): void => {
  console.error(err);
  process.exitCode = 1;
});
