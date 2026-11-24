import { createRunController, RunCancelledError } from '../src/core/run-control.js';
import {
  parseAskPeerMarkers,
  resolveConsultations,
  stripAskPeerMarkers,
  stripExecutionMarkers,
} from '../src/core/agent-bus.js';
import { createSharedBoard } from '../src/core/shared-board.js';
import type { TaskAgent } from '../src/core/task-runner.js';
import type { AgentName, Context, Task, RunScope } from '../src/types.js';
import { check, finish } from './test-db-helpers.js';

const CONTEXT: Context = { memories: [] };
const TASK: Task = {
  id: 't1', description: 'main task', intent: 'build', agentName: 'coder',
  status: 'pending', verificationRequired: false, dependsOn: [],
};
const SCOPE: RunScope = { kind: 'daily', windowId: 1, sessionId: 9 };

function peer(name: AgentName, content: string): TaskAgent {
  return {
    name,
    execute: async (): Promise<{ content: string }> => ({ content }),
  };
}

async function main(): Promise<void> {
  console.log('=== STEP 82B - AgentBus Test ===\n');

  const one = parseAskPeerMarkers('راجع [[ASK_PEER:advisor|المخاطر]]', 'coder');
  check('valid marker parsed', one.length === 1 && one[0]?.to === 'advisor');
  check('self consultation rejected', parseAskPeerMarkers('[[ASK_PEER:coder|x]]', 'coder').length === 0);
  check('unregistered agent rejected', parseAskPeerMarkers('[[ASK_PEER:researcher|x]]', 'coder').length === 0);
  check(
    'cycle through chain rejected',
    parseAskPeerMarkers('[[ASK_PEER:mentor|x]]', 'coder', ['mentor']).length === 0,
  );
  const many = parseAskPeerMarkers(
    '[[ASK_PEER:advisor|a]][[ASK_PEER:commander|b]][[ASK_PEER:designer|c]]', 'coder',
  );
  check('at most two consultations per task', many.length === 2);
  check('topic markers removed', stripExecutionMarkers('س [[WRITE_FILE:x]] ي').includes('WRITE_FILE') === false);

  const mixed = 'بداية [[ASK_PEER:advisor|سؤال]] نهاية';
  check('peer marker stripped from base text', stripAskPeerMarkers(mixed).includes('ASK_PEER') === false);
  check('base text retained', stripAskPeerMarkers(mixed).includes('بداية'));

  const board = createSharedBoard(SCOPE, 'bus-test');
  const events: Array<{ from: AgentName; to: AgentName; topic: string }> = [];
  let commanderCalls = 0;
  const nested = [
    'رد المستشار',
    '[[ASK_PEER:commander|تابع]]',
    '[[MKDIR:tmp]]',
    '[WRITE_FILE: bad.ts]',
    'bad content',
    '[/WRITE_FILE]',
    '[[MCP_CALL:tool]]',
  ].join('\n');

  const longQuestion = 'س'.repeat(200);
  const input = `[[ASK_PEER:advisor|${longQuestion}]]`;
  const result = await resolveConsultations('coder', input, {
    context: CONTEXT,
    task: TASK,
    board,
    onConsult: (event): void => { events.push(event); },
    resolvePeer: (name): TaskAgent | null => {
      if (name === 'commander') {
        commanderCalls += 1;
        return peer('commander', 'must not run');
      }
      return peer('advisor', nested);
    },
  });

  check('depth is fixed at one', commanderCalls === 0);
  check('nested peer markers stripped', !result.content.includes('ASK_PEER'));
  check('file markers stripped from peer reply', !/WRITE_FILE|MKDIR|MCP_CALL/.test(result.content));
  check('peer reply summary appended', result.content.includes('# استشارة advisor'));
  check('clean peer text retained', result.content.includes('رد المستشار'));
  check('one consultation resolved', result.consultations === 1);
  check('onConsult called once', events.length === 1);
  check('consult event from coder to advisor', events[0]?.from === 'coder' && events[0]?.to === 'advisor');
  check('topic capped at 160 chars', events[0]?.topic.length === 160);
  check('board records consultation', board.get('consult:advisor') !== null);

  const empty = await resolveConsultations('coder', 'نص بلا وسوم', {
    context: CONTEXT, task: TASK,
    resolvePeer: (): TaskAgent | null => null,
  });
  check('plain text unchanged', empty.content === 'نص بلا وسوم' && empty.consultations === 0);

  const preCancelled = createRunController();
  preCancelled.cancel();
  let threwBefore = false;
  try {
    await resolveConsultations('coder', input, {
      context: CONTEXT, task: TASK, signal: preCancelled.signal,
      resolvePeer: (name): TaskAgent => peer(name, 'x'),
    });
  } catch (err) {
    threwBefore = err instanceof RunCancelledError;
  }
  check('abort before consultation respected', threwBefore);

  const midRun = createRunController();
  let threwAfter = false;
  try {
    await resolveConsultations('coder', input, {
      context: CONTEXT, task: TASK, signal: midRun.signal,
      resolvePeer: (name): TaskAgent => ({
        name,
        execute: async (): Promise<{ content: string }> => {
          midRun.cancel();
          return { content: 'رد' };
        },
      }),
    });
  } catch (err) {
    threwAfter = err instanceof RunCancelledError;
  }
  check('abort after consultation respected', threwAfter);

  finish();
}

void main().catch((err: unknown): void => {
  console.error(err);
  process.exitCode = 1;
});
