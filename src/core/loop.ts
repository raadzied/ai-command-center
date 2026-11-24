import { createPlan } from './planner.js';
import type { Plan } from './planner.js';
import { selectAgent } from './router.js';
import { topologicalSort } from './decomposer.js';
import { chat } from '../llm/chat.js';
import type { ChatOptions } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';
import { buildMemoryContext, saveToMemory } from './memory.js';
import { evaluateQuality } from './quality-gate.js';
import { processMarkers, type MarkerResult } from '../tools/markers.js';
import { enqueueSpeech } from '../voice/state.js';
import { getAssistantMode } from '../security/settings.js';
import { buildInstructionSkillsText, buildMcpToolsText } from '../agents/base.js';
import { runTask } from './task-runner.js';
import { createSharedBoard } from './shared-board.js';
import { emitActivity } from './hud-activity.js';
import { RunCancelledError, throwIfAborted } from './run-control.js';
import type { TaskRunnerDeps } from './task-runner.js';
import type { RunPhase, RunPhaseListener } from './run-control.js';
import type { AgentName, Context, RunScope, TaskSummary } from '../types.js';

const CHAT_SYSTEM = `أنت مساعد في AI Command Center.
تحدث بالعربية الفصحى المبسطة، باختصار ووضوح.
إن طُرح سؤال تقني معقد، اقترح صياغة محددة يمكن للمستخدم طرحها
لتفعيل وكيل متخصص (علّمني، اكتب، صمم).
لا تتجاوز 200 كلمة.`;

export interface LoopResult {
  intent: string;
  agentUsed: string | null;
  content: string;
  elapsedMs: number;
  taskSummary?: TaskSummary[];
}

export interface LoopDeps extends TaskRunnerDeps {
  buildMemoryContext: (input: string, scope: RunScope) => Promise<Context>;
  createPlan: (input: string, ctx: Context, signal?: AbortSignal) => Promise<Plan>;
  saveToMemory: (user: string, agent: string, name: string | null, scope: RunScope) => Promise<void>;
  chat: (system: string, user: string, opts?: ChatOptions) => Promise<string>;
  onTaskStart?: (index: number, total: number) => void;
}

export const CLI_SCOPE: RunScope = {
  kind: 'workspace', windowId: null, projectId: null, sessionId: null, workspaceRoot: process.cwd(),
};

function createRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const BASE_DEPS: LoopDeps = {
  buildMemoryContext, createPlan, selectAgent, evaluateQuality,
  processMarkers: (text: string, signal?: AbortSignal, onPhase?: RunPhaseListener): Promise<MarkerResult> =>
    processMarkers(text, CLI_SCOPE, signal, onPhase),
  saveToMemory,
  enqueueSpeech, chat, onAgentActive: (): void => {}, onTaskStart: (): void => {},
  onPhase: (): void => {},
};

export function createDefaultDeps(scope: RunScope): LoopDeps {
  return {
    ...BASE_DEPS, scope,
    buildMemoryContext: (input: string, runScope: RunScope = scope): Promise<Context> =>
      buildMemoryContext(input, runScope),
    saveToMemory: (user: string, agent: string, name: string | null, runScope: RunScope = scope): Promise<void> =>
      saveToMemory(user, agent, name, runScope),
    processMarkers: (text: string, signal?: AbortSignal, onPhase?: (phase: RunPhase, detail?: string) => void): Promise<MarkerResult> => processMarkers(text, scope, signal, onPhase),
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

function complete(deps: LoopDeps, result: LoopResult): LoopResult {
  deps.onPhase?.('DONE');
  return result;
}

async function saveWithActivity(
  deps: LoopDeps,
  user: string,
  agent: string,
  name: string | null,
  scope: RunScope,
): Promise<void> {
  emitActivity(deps.onActivity, { nodeId: 'sqlite', state: 'active' });
  await deps.saveToMemory(user, agent, name, scope);
  emitActivity(deps.onActivity, { nodeId: 'sqlite', state: 'done' });
}

export async function processInputScoped(
  input: string,
  scope: RunScope,
  overrides: Partial<LoopDeps> = {},
): Promise<LoopResult> {
  const deps: LoopDeps = { ...createDefaultDeps(scope), ...overrides };
  // كل تشغيل يحصل على لوحته الخاصة؛ لا مشاركة بين النوافذ ولا حالة عامة.
  const board = createSharedBoard(scope, createRunId());
  const runDeps: TaskRunnerDeps = { ...deps, board };
  const start = Date.now();
  const trimmed = input.trim();
  try {
    if (!trimmed) return complete(deps, { intent: 'empty', agentUsed: null, content: '', elapsedMs: 0 });
    throwIfAborted(deps.signal);
    deps.onPhase?.('PLANNING');
    emitActivity(deps.onActivity, { nodeId: 'sqlite', state: 'active' });
    emitActivity(deps.onActivity, { nodeId: 'context', state: 'active' });
    const context = await deps.buildMemoryContext(trimmed, scope);
    throwIfAborted(deps.signal);
    emitActivity(deps.onActivity, {
      nodeId: 'sqlite', state: 'done', detail: `${context.memories.length} memories`,
    });
    emitActivity(deps.onActivity, {
      nodeId: 'context', state: 'done',
      detail: `${context.memories.length} memories, ${context.recentMessages?.length ?? 0} messages`,
    });
    emitActivity(deps.onActivity, { nodeId: 'orchestrator', state: 'active' });
    const plan = await deps.createPlan(trimmed, context, deps.signal);
    throwIfAborted(deps.signal);
    const mode = getAssistantMode();
    if (mode === 'planning' && !plan.isChat) {
      const content = formatPlanOnly(plan);
      deps.enqueueSpeech(content, null);
      return complete(deps, { intent: plan.intent, agentUsed: null, content, elapsedMs: Date.now() - start });
    }
    if (plan.isChat) {
      log.info('Handling as chat');
      const history = (context.recentMessages ?? []).map((m) => ({ role: m.role, content: m.content }));
      const skillsText = [buildInstructionSkillsText(context), buildMcpToolsText(context)].filter(Boolean).join('\n\n');
      const chatInput = skillsText === '' ? trimmed : `${skillsText}\n\n# المهمة:\n${trimmed}`;
      deps.onPhase?.('THINKING');
      const reply = await deps.chat(CHAT_SYSTEM, chatInput, {
        temperature: 0.6, maxTokens: 800, ...(history.length > 0 ? { history } : {}),
        ...(deps.signal ? { signal: deps.signal } : {}),
      });
      throwIfAborted(deps.signal);
      if (mode === 'build') await saveWithActivity(deps, trimmed, reply.trim(), null, scope);
      const result = { intent: 'chat', agentUsed: null, content: reply.trim(), elapsedMs: Date.now() - start };
      deps.enqueueSpeech(result.content, result.agentUsed);
      return complete(deps, result);
    }
    if (plan.tasks.length === 0) {
      const result = { intent: plan.intent, agentUsed: null, content: 'لم أتمكن من بناء مهمة من هذا الطلب.', elapsedMs: Date.now() - start };
      deps.enqueueSpeech(result.content, result.agentUsed);
      return complete(deps, result);
    }
    const ordered = topologicalSort(plan.tasks);
    log.info('Executing task graph', { total: ordered.length });
    const parts: string[] = [];
    const summaries: TaskSummary[] = [];
    let prevOutput = '';
    let lastAgent: AgentName | null = null;
    let anyUnverified = false;
    for (let i = 0; i < ordered.length; i += 1) {
      throwIfAborted(deps.signal);
      const task = ordered[i];
      if (!task) continue;
      deps.onTaskStart?.(i + 1, ordered.length);
      const outcome = await runTask(runDeps, { task, index: i, total: ordered.length, context, prevOutput });
      parts.push(outcome.rendered);
      prevOutput = outcome.rawOutput;
      if (outcome.unverified) anyUnverified = true;
      if (outcome.agentUsed !== null) lastAgent = outcome.agentUsed;
      summaries.push(outcome.summary);
    }
    let content = anyUnverified
      ? `[WARN] [بعض الردود غير مُتحققة — تعذّر تشغيل المراجع]\n\n${parts.join('\n\n')}`
      : parts.join('\n\n');
    const failed = summaries.filter((summary) => summary.status === 'failed');
    if (failed.length > 0) {
      content += `\n\n[WARN] فشلت ${failed.length}/${summaries.length} مهمة:\n` +
        failed.map((summary) => `  • ${summary.id}: ${summary.error}`).join('\n');
    }
    const result: LoopResult = { intent: plan.intent, agentUsed: lastAgent, content, elapsedMs: Date.now() - start };
    if (summaries.length > 1) result.taskSummary = summaries;
    throwIfAborted(deps.signal);
    await saveWithActivity(deps, trimmed, result.content, lastAgent, scope);
    throwIfAborted(deps.signal);
    deps.onAgentActive?.(null);
    return complete(deps, result);
  } catch (err) {
    deps.onAgentActive?.(null);
    if (err instanceof RunCancelledError || deps.signal?.aborted) {
      deps.onPhase?.('CANCELLED');
      throw err instanceof RunCancelledError ? err : new RunCancelledError();
    }
    deps.onPhase?.('ERROR', err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    emitActivity(deps.onActivity, { nodeId: 'orchestrator', state: 'done', ttlMs: 2000 });
    emitActivity(deps.onActivity, { nodeId: 'telemetry', state: 'done', ttlMs: 1800 });
    board.dispose();
  }
}

export async function processInput(input: string, overrides: Partial<LoopDeps> = {}): Promise<LoopResult> {
  return processInputScoped(input, CLI_SCOPE, overrides);
}
