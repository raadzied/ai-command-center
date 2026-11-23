import { createPlan } from './planner.js';
import type { Plan } from './planner.js';
import { selectAgent } from './router.js';
import { topologicalSort } from './decomposer.js';
import { chat } from '../llm/chat.js';
import type { ChatOptions } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';
import { buildMemoryContext, saveToMemory } from './memory.js';
import { evaluateQuality } from './quality-gate.js';
import { processMarkers } from '../tools/markers.js';
import { enqueueSpeech } from '../voice/state.js';
import { getAssistantMode } from '../security/settings.js';
import { runTask } from './task-runner.js';
import type { TaskRunnerDeps } from './task-runner.js';
import type { AgentName, Context, RunScope, TaskSummary } from '../types.js';

// رد عام للدردشة العادية
const CHAT_SYSTEM = `أنت مساعد في AI Command Center.
تحدث بالعربية الفصحى المبسطة، باختصار ووضوح.
إن طُرح سؤال تقني معقد، اقترح صياغة محددة يمكن للمستخدم طرحها
لتفعيل وكيل متخصص (علّمني، اكتب، صمم).
لا تتجاوز 200 كلمة.`;

// نتيجة معالجة مدخل واحد
export interface LoopResult {
  intent: string;
  agentUsed: string | null;
  content: string;
  elapsedMs: number;
  // تفصيل المهام في خطة متعددة (اختياري)
  taskSummary?: TaskSummary[];
}

// التبعيات القابلة للحقن (للاختبار بلا API)
export interface LoopDeps extends TaskRunnerDeps {
  buildMemoryContext: (input: string, scope: RunScope) => Promise<Context>;
  createPlan: (input: string, ctx: Context) => Promise<Plan>;
  saveToMemory: (
    user: string, agent: string, name: string | null, scope: RunScope,
  ) => Promise<void>;
  chat: (system: string, user: string, opts?: ChatOptions) => Promise<string>;
  onTaskStart?: (index: number, total: number) => void;
}

// نطاق CLI الافتراضي: مساحة عمل بلا مشروع مسجّل
export const CLI_SCOPE: RunScope = {
  kind: 'workspace', windowId: null, projectId: null, sessionId: null,
  workspaceRoot: process.cwd(),
};

// التبعيات الحقيقية — الافتراضي في الإنتاج
const BASE_DEPS: LoopDeps = {
  buildMemoryContext,
  createPlan,
  selectAgent,
  evaluateQuality,
  processMarkers,
  saveToMemory,
  enqueueSpeech,
  chat,
  onAgentActive: (): void => {},
  onTaskStart: (): void => {},
};

/** يبني التبعيات الحقيقية مع ربط دوال الذاكرة بالنطاق المطلوب. */
export function createDefaultDeps(scope: RunScope): LoopDeps {
  return {
    ...BASE_DEPS,
    buildMemoryContext: (input: string, runScope: RunScope = scope): Promise<Context> =>
      buildMemoryContext(input, runScope),
    saveToMemory: (
      user: string, agent: string, name: string | null, runScope: RunScope = scope,
    ): Promise<void> => saveToMemory(user, agent, name, runScope),
  };
}

function formatPlanOnly(plan: Plan): string {
  if (plan.tasks.length === 0) {
    return 'وضع التخطيط: لم أتمكن من استخراج خطوات قابلة للتنفيذ. لم يتم تنفيذ أي إجراء.';
  }

  const steps = plan.tasks.map((task, index) => `${index + 1}. [${task.agentName}] ${task.description}`);
  return [
    'وضع التخطيط — هذه خطة فقط، ولم يتم تشغيل الوكلاء أو تعديل أي ملف.',
    ...steps,
    'انتقل إلى وضع البناء إذا أردت تنفيذ هذه الخطوات.',
  ].join('\n');
}

// يعالج مدخل المستخدم ضمن نطاق صريح (مشروع/جلسة أو وضع يومي)
export async function processInputScoped(
  input: string,
  scope: RunScope,
  overrides: Partial<LoopDeps> = {},
): Promise<LoopResult> {
  const deps: LoopDeps = { ...createDefaultDeps(scope), ...overrides };
  const start = Date.now();
  const trimmed = input.trim();

  if (!trimmed) {
    return { intent: 'empty', agentUsed: null, content: '', elapsedMs: 0 };
  }

  const context = await deps.buildMemoryContext(trimmed, scope);
  const plan = await deps.createPlan(trimmed, context);
  const mode = getAssistantMode();

  if (mode === 'planning' && !plan.isChat) {
    const content = formatPlanOnly(plan);
    const result: LoopResult = {
      intent: plan.intent,
      agentUsed: null,
      content,
      elapsedMs: Date.now() - start,
    };
    deps.enqueueSpeech(content, null);
    return result;
  }

  // دردشة عادية — مرّر آخر رسائل الجلسة كسياق متعدد الأدوار
  if (plan.isChat) {
    log.info('Handling as chat');
    const history = (context.recentMessages ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const reply = await deps.chat(CHAT_SYSTEM, trimmed, {
      temperature: 0.6,
      maxTokens: 800,
      ...(history.length > 0 ? { history } : {}),
    });
    if (mode === 'build') {
      await deps.saveToMemory(trimmed, reply.trim(), null, scope);
    }
    const result: LoopResult = {
      intent: 'chat',
      agentUsed: null,
      content: reply.trim(),
      elapsedMs: Date.now() - start,
    };
    deps.enqueueSpeech(result.content, result.agentUsed);
    return result;
  }

  if (plan.tasks.length === 0) {
    const result: LoopResult = {
      intent: plan.intent,
      agentUsed: null,
      content: 'لم أتمكن من بناء مهمة من هذا الطلب.',
      elapsedMs: Date.now() - start,
    };
    deps.enqueueSpeech(result.content, result.agentUsed);
    return result;
  }

  // نفّذ المهام بالترتيب الطوبولوجي
  const ordered = topologicalSort(plan.tasks);
  log.info('Executing task graph', { total: ordered.length });

  const parts: string[] = [];
  const summaries: TaskSummary[] = [];
  let prevOutput = '';
  let lastAgent: AgentName | null = null;
  let anyUnverified = false;

  for (let i = 0; i < ordered.length; i += 1) {
    const task = ordered[i];
    if (!task) continue;

    deps.onTaskStart?.(i + 1, ordered.length);
    const outcome = await runTask(deps, {
      task,
      index: i,
      total: ordered.length,
      context,
      prevOutput,
    });

    parts.push(outcome.rendered);
    prevOutput = outcome.rawOutput;
    if (outcome.unverified) anyUnverified = true;
    if (outcome.agentUsed !== null) lastAgent = outcome.agentUsed;
    summaries.push(outcome.summary);
  }

  const combined = parts.join('\n\n');
  let content = anyUnverified
    ? `⚠️ [بعض الردود غير مُتحققة — تعذّر تشغيل المراجع]\n\n${combined}`
    : combined;

  const failed = summaries.filter((s) => s.status === 'failed');
  if (failed.length > 0) {
    content +=
      `\n\n⚠️ فشلت ${failed.length}/${summaries.length} مهمة:\n` +
      failed.map((s) => `  • ${s.id}: ${s.error}`).join('\n');
  }

  const result: LoopResult = {
    intent: plan.intent,
    agentUsed: lastAgent,
    content,
    elapsedMs: Date.now() - start,
  };
  if (summaries.length > 1) result.taskSummary = summaries;

  // حفظ واحد لكل مدخل: نص المستخدم الأصلي + الرد المُجمَّع النهائي
  await deps.saveToMemory(trimmed, result.content, lastAgent, scope);

  deps.onAgentActive?.(null);
  return result;
}

// الواجهة القديمة — تُثبّت نطاق CLI للحفاظ على التوافق العكسي
export async function processInput(
  input: string,
  overrides: Partial<LoopDeps> = {},
): Promise<LoopResult> {
  return processInputScoped(input, CLI_SCOPE, overrides);
}
