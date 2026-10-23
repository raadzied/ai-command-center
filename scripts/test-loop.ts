import 'dotenv/config';
import { processInput } from '../src/core/loop.js';
import type { LoopDeps } from '../src/core/loop.js';
import type { Plan } from '../src/core/planner.js';
import type {
  Task,
  Context,
  QualityResult,
  AgentName,
} from '../src/types.js';

// أدوات إنشاء mocks
function mockAgent(name: AgentName, content: string) {
  return {
    name,
    execute: async (_t: Task, _c: Context) => ({ content }),
  };
}

function mockPlan(tasks: Task[]): Plan {
  return {
    intent: tasks[0]?.intent ?? 'build',
    isChat: false,
    tasks,
  };
}

function mkTask(id: string, agent: AgentName, desc: string): Task {
  return {
    id,
    description: desc,
    intent: 'build',
    agentName: agent,
    status: 'pending',
    verificationRequired: false,
    dependsOn: [],
  };
}

// حالة اختبار
interface TestCase {
  label: string;
  deps: Partial<LoopDeps>;
  expectContentIncludes: string[];
  expectContentExcludes?: string[];
  expectTaskSummary?: boolean;
}

async function runCase(tc: TestCase): Promise<boolean> {
  const result = await processInput('test input', tc.deps);
  const content = result.content;

  const includeOk = tc.expectContentIncludes.every((s) => content.includes(s));
  const excludeOk = (tc.expectContentExcludes ?? []).every(
    (s) => !content.includes(s),
  );
  const summaryOk =
    tc.expectTaskSummary === undefined
      ? true
      : (result.taskSummary !== undefined) === tc.expectTaskSummary;

  const ok = includeOk && excludeOk && summaryOk;

  console.log(`\n${ok ? '✓' : '✗'} ${tc.label}`);
  if (!ok) {
    console.log(`  includes check: ${includeOk}`);
    console.log(`  excludes check: ${excludeOk}`);
    console.log(
      `  summary check: ${summaryOk} (got ${
        result.taskSummary ? result.taskSummary.length : 'undefined'
      })`,
    );
    console.log(`  content preview: ${content.slice(0, 200)}`);
  }
  return ok;
}

// ملاحظة: extractAndSaveSkill ليس محقوناً (مخرجاته < 300 حرف
// فتتوقف قبل أي استدعاء API — لا ترفع طول mock فوق 300).
async function main(): Promise<void> {
  console.log('=== Loop Test (dependency injection) ===\n');

  const baseDeps = (overrides: Partial<LoopDeps> = {}): Partial<LoopDeps> => ({
    buildMemoryContext: async () => ({ memories: [] }),
    saveToMemory: async () => {},
    enqueueSpeech: () => {},
    processMarkers: async (text) => ({
      cleanedContent: text,
      writeStatus: '',
      wroteCount: 0,
      rejectedCount: 0,
      totalMarkers: 0,
      wrotePaths: [],
    }),
    evaluateQuality: async (): Promise<QualityResult> => ({
      status: 'PASS',
      score: 1,
      issues: [],
      summary: 'ok',
    }),
    ...overrides,
  });

  const cases: TestCase[] = [
    // 1) chat path
    {
      label: 'chat path (isChat=true)',
      deps: baseDeps({
        createPlan: async () => ({ intent: 'chat', isChat: true, tasks: [] }),
        chat: async () => 'مرحباً بك',
      }),
      expectContentIncludes: ['مرحباً'],
      expectTaskSummary: false,
    },
    // 2) single task success
    {
      label: 'single task, PASS',
      deps: baseDeps({
        createPlan: async () => mockPlan([mkTask('t1', 'mentor', 'do thing')]),
        selectAgent: () => mockAgent('mentor', 'task output'),
      }),
      expectContentIncludes: ['task output'],
      expectTaskSummary: false,
    },
    // 3) two tasks, both PASS
    {
      label: 'two tasks, both PASS',
      deps: baseDeps({
        createPlan: async () =>
          mockPlan([
            mkTask('t1', 'mentor', 'first'),
            mkTask('t2', 'coder', 'second'),
          ]),
        selectAgent: (t) => mockAgent(t.agentName, `${t.id} output`),
      }),
      expectContentIncludes: ['t1 output', 't2 output', 'المهمة 1', 'المهمة 2'],
      expectTaskSummary: true,
    },
    // 4) three tasks, MIDDLE FAILS
    {
      label: 'three tasks, middle fails',
      deps: baseDeps({
        createPlan: async () =>
          mockPlan([
            mkTask('t1', 'mentor', 'first'),
            mkTask('t2', 'coder', 'second'),
            mkTask('t3', 'designer', 'third'),
          ]),
        selectAgent: (t) => {
          if (t.id === 't2') {
            return {
              name: 'coder',
              execute: async () => {
                throw new Error('Simulated API failure');
              },
            };
          }
          return mockAgent(t.agentName, `${t.id} output`);
        },
      }),
      expectContentIncludes: ['t1 output', 't3 output', 'فشلت'],
      expectContentExcludes: ['t2 output'],
      expectTaskSummary: true,
    },
    // 5) single task FAILS
    {
      label: 'single task fails',
      deps: baseDeps({
        createPlan: async () => mockPlan([mkTask('t1', 'coder', 'only')]),
        selectAgent: () => ({
          name: 'coder',
          execute: async () => {
            throw new Error('boom');
          },
        }),
      }),
      expectContentIncludes: ['فشلت'],
      expectTaskSummary: false, // summaries.length === 1 → undefined
    },
  ];

  let passed = 0;
  for (const tc of cases) {
    if (await runCase(tc)) passed++;
  }

  console.log(`\n=== ${passed}/${cases.length} passed ===`);
  process.exit(passed === cases.length ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ test-loop failed:', err);
  process.exit(1);
});