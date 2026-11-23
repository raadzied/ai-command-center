import 'dotenv/config';
import { CLI_SCOPE, processInput, processInputScoped } from '../src/core/loop.js';
import type { LoopDeps } from '../src/core/loop.js';
import type { Plan } from '../src/core/planner.js';
import type { ChatOptions } from '../src/llm/chat.js';
import type { Context, RunScope, Task } from '../src/types.js';

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) {
    passed += 1;
    console.log(`✓ ${label}`);
  } else {
    failed += 1;
    console.log(`✗ ${label}`);
  }
}

function sameScope(actual: RunScope | null | undefined, expected: RunScope): boolean {
  if (!actual || actual.kind !== expected.kind) return false;
  if (actual.windowId !== expected.windowId) return false;
  if (actual.sessionId !== expected.sessionId) return false;
  if (actual.kind === 'workspace' && expected.kind === 'workspace') {
    return (
      actual.projectId === expected.projectId &&
      actual.workspaceRoot === expected.workspaceRoot
    );
  }
  return true;
}

const TASK: Task = {
  id: 't1',
  description: 'do thing',
  intent: 'build',
  agentName: 'coder',
  status: 'pending',
  verificationRequired: false,
  dependsOn: [],
};

const CHAT_PLAN = async (): Promise<Plan> => ({ intent: 'chat', isChat: true, tasks: [] });

function taskDeps(overrides: Partial<LoopDeps> = {}): Partial<LoopDeps> {
  return {
    createPlan: async () => ({ intent: 'build', isChat: false, tasks: [TASK] }),
    selectAgent: () => ({
      name: 'coder',
      execute: async () => ({ content: 'task output' }),
    }),
    evaluateQuality: async () => ({ status: 'PASS', score: 1, issues: [], summary: 'ok' }),
    processMarkers: async (text) => ({
      cleanedContent: text, writeStatus: '', wroteCount: 0,
      rejectedCount: 0, totalMarkers: 0, wrotePaths: [],
    }),
    enqueueSpeech: () => {},
    chat: async () => 'chat reply',
    ...overrides,
  };
}

interface Capture {
  memoryScope: RunScope | null;
  saveScope: RunScope | null;
  savedUser: string;
  savedAgent: string;
  savedName: string | null;
  chatOptions: ChatOptions | null;
  recent: Context['recentMessages'];
}

function newCapture(recent?: Context['recentMessages']): Capture {
  return {
    memoryScope: null, saveScope: null, savedUser: '', savedAgent: '',
    savedName: null, chatOptions: null, recent,
  };
}

function captureDeps(
  capture: Capture,
  overrides: Partial<LoopDeps> = {},
): Partial<LoopDeps> {
  return taskDeps({
    buildMemoryContext: async (_input: string, scope: RunScope): Promise<Context> => {
      capture.memoryScope = scope;
      const recent = capture.recent;
      if (recent === undefined) return { memories: [] };
      return { memories: [], recentMessages: recent };
    },
    saveToMemory: async (
      user: string, agent: string, name: string | null, scope: RunScope,
    ): Promise<void> => {
      capture.saveScope = scope;
      capture.savedUser = user;
      capture.savedAgent = agent;
      capture.savedName = name;
    },
    ...overrides,
  });
}

async function main(): Promise<void> {
  console.log('=== Loop Scope Test ===\n');

  // 1) نطاق workspace يصل إلى الذاكرة والحفظ
  const workspaceScope: RunScope = {
    kind: 'workspace',
    windowId: 1,
    projectId: 42,
    sessionId: 7,
    workspaceRoot: 'C:\\workspace\\demo',
  };
  const capture = newCapture();
  const result = await processInputScoped('do it', workspaceScope, captureDeps(capture));
  check(
    'workspace scope passed to buildMemoryContext',
    sameScope(capture.memoryScope, workspaceScope),
  );
  check(
    'workspace scope passed to saveToMemory',
    sameScope(capture.saveScope, workspaceScope),
  );
  check('saveToMemory receives original user input', capture.savedUser === 'do it');
  check('saveToMemory receives combined agent output', capture.savedAgent.includes('task output'));
  check('saveToMemory receives agent name', capture.savedName === 'coder');
  check(
    'task result keeps legacy shape',
    result.intent === 'build' && result.agentUsed === 'coder',
  );

  // 2) الوضع اليومي
  const dailyScope: RunScope = { kind: 'daily', windowId: null, sessionId: 9 };
  const dailyCapture = newCapture();
  await processInputScoped('daily', dailyScope, captureDeps(dailyCapture));
  check(
    'daily scope passed to buildMemoryContext',
    sameScope(dailyCapture.memoryScope, dailyScope),
  );
  check('daily scope passed to saveToMemory', sameScope(dailyCapture.saveScope, dailyScope));

  // 3) مسار الدردشة يستقبل recentMessages كسجل محادثة
  const recent = [
    { role: 'user' as const, agentName: null, content: 'سؤال سابق' },
    { role: 'agent' as const, agentName: 'mentor', content: 'جواب سابق' },
  ];
  const chatCapture = newCapture(recent);
  await processInputScoped(
    'سؤال جديد',
    workspaceScope,
    captureDeps(chatCapture, {
      createPlan: CHAT_PLAN,
      chat: async (_system: string, _user: string, opts?: ChatOptions): Promise<string> => {
        chatCapture.chatOptions = opts ?? null;
        return 'رد جديد';
      },
    }),
  );
  const history = chatCapture.chatOptions?.history;
  check('chat receives recentMessages as history', history?.length === 2);
  check(
    'chat history keeps order and roles',
    history?.[0]?.role === 'user' &&
      history?.[0]?.content === 'سؤال سابق' &&
      history?.[1]?.role === 'agent' &&
      history?.[1]?.content === 'جواب سابق',
  );

  // 4) لا يُمرَّر history عندما لا توجد رسائل سابقة
  const emptyCapture = newCapture();
  await processInputScoped(
    'بلا سجل',
    workspaceScope,
    captureDeps(emptyCapture, {
      createPlan: CHAT_PLAN,
      chat: async (_system: string, _user: string, opts?: ChatOptions): Promise<string> => {
        emptyCapture.chatOptions = opts ?? null;
        return 'رد';
      },
    }),
  );
  check('chat history omitted when empty', emptyCapture.chatOptions?.history === undefined);

  // 5) الواجهة القديمة تستخدم CLI_SCOPE
  const legacyCapture = newCapture();
  await processInput('legacy', captureDeps(legacyCapture));
  check('processInput uses CLI_SCOPE', sameScope(legacyCapture.memoryScope, CLI_SCOPE));
  check(
    'CLI_SCOPE is an unscoped workspace',
    CLI_SCOPE.kind === 'workspace' &&
      CLI_SCOPE.windowId === null &&
      CLI_SCOPE.projectId === null &&
      CLI_SCOPE.sessionId === null &&
      CLI_SCOPE.workspaceRoot === process.cwd(),
  );

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('❌ test-loop-scope failed:', err);
  process.exit(1);
});
