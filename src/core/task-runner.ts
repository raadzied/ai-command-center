import { logger as log } from '../llm/logger.js';
import { extractAndSaveSkill } from './skills.js';
import { MAX_RETRIES } from './quality-gate.js';
import { validateTscFiles } from '../tools/tsc-validate.js';
import { processMcpMarkers } from '../tools/mcp-markers.js';
import { RunCancelledError, throwIfAborted } from './run-control.js';
import type { MarkerResult } from '../tools/markers.js';
import type { RunPhaseListener } from './run-control.js';
import type {
  AgentName,
  Context,
  QualityInput,
  QualityResult, RunScope,
  Task,
  TaskSummary,
} from '../types.js';

export type TaskAgent = {
  readonly name: AgentName;
  execute(task: Task, context: Context, options?: { signal?: AbortSignal }): Promise<{ content: string }>;
};

export interface TaskRunnerDeps {
  selectAgent: (task: Task) => TaskAgent | null;
  evaluateQuality: (input: QualityInput, signal?: AbortSignal) => Promise<QualityResult>;
  processMarkers: (text: string, signal?: AbortSignal, onPhase?: RunPhaseListener) => Promise<MarkerResult>;
  scope?: RunScope;
  enqueueSpeech: (text: string, agent: string | null) => void;
  onAgentActive?: (agentName: AgentName | null) => void;
  signal?: AbortSignal;
  onPhase?: RunPhaseListener;
}
export interface TaskRunInput {
  readonly task: Task;
  readonly index: number;
  readonly total: number;
  readonly context: Context;
  readonly prevOutput: string;
}

export interface TaskRunResult {
  readonly rendered: string;
  readonly rawOutput: string;
  readonly summary: TaskSummary;
  readonly unverified: boolean;
  readonly agentUsed: AgentName | null;
}

function enrichTask(task: Task, prevOutput: string): Task {
  if (prevOutput.length === 0) return task;
  const priorContext = `# مخرجات المهام السابقة (سياق، ليست طلبًا من المستخدم):\n${prevOutput}\n\n# مهمتك:\n${task.description}`;
  return { ...task, description: `${task.description}\n\n${priorContext}` };
}

function applyMcpCalls(content: string, context: Context, deps: TaskRunnerDeps): Promise<string> {
  if (!content.includes('[[MCP_CALL:')) return Promise.resolve(content);
  deps.onPhase?.('APPLYING_CHANGES');
  return processMcpMarkers(content, context.scope, deps.signal).then((result): string => {
    if (result.toolOutputs.length === 0) return result.cleanedContent;
    log.info('MCP markers executed', { count: result.executedCount });
    return `${result.cleanedContent}\n\n# MCP Tool Results\n${result.toolOutputs.join('\n')}`;
  });
}

async function applyMarkers(
  deps: TaskRunnerDeps,
  agentName: AgentName,
  content: string,
): Promise<string> {
  if (agentName !== 'coder') return content;
  throwIfAborted(deps.signal); deps.onPhase?.('APPLYING_CHANGES');
  const markerResult = await deps.processMarkers(content, deps.signal, deps.onPhase);
  throwIfAborted(deps.signal);
  let display = markerResult.cleanedContent + markerResult.writeStatus;
  if (markerResult.totalMarkers > 0) log.info('Markers processed', {
    total: markerResult.totalMarkers, wrote: markerResult.wroteCount, rejected: markerResult.rejectedCount,
  });
  const tsFiles = markerResult.wrotePaths.filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'));
  if (tsFiles.length === 0 || deps.scope?.kind === 'daily') return display;
  deps.onPhase?.('VALIDATING'); throwIfAborted(deps.signal);
  const tscResult = await validateTscFiles(tsFiles, deps.scope?.kind === 'workspace' ? { workspaceRoot: deps.scope.workspaceRoot } : {});
  throwIfAborted(deps.signal);
  if (!tscResult.ok) {
    const errLines = tscResult.errors.slice(0, 5).map((e) => `  ${e}`).join('\n');
    display += `\n\n[WARN] الملفات المكتوبة تكسر tsc:\n${errLines}\n   أصلحها قبل البناء.`;
    log.warn('Generated files break tsc', { count: tscResult.errors.length });
  }
  return display;
}

interface QualityLoopResult {
  readonly content: string;
  readonly attempts: number;
  readonly unverified: boolean;
}

async function runQualityLoop(deps: TaskRunnerDeps, agent: TaskAgent, task: Task, context: Context): Promise<QualityLoopResult> {
  throwIfAborted(deps.signal);
  deps.onPhase?.('THINKING');
  let output = await agent.execute(task, context, deps.signal ? { signal: deps.signal } : {});
  throwIfAborted(deps.signal);
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    const failureReason = output.content.includes('[WARN] [الرد مقطوع')
      ? ('MAX_TOKENS' as const)
      : undefined;
    if (failureReason) {
      log.warn('Detected truncation', { reason: failureReason, agent: agent.name });
    }

    throwIfAborted(deps.signal);
    deps.onPhase?.('VALIDATING');
    const quality = await deps.evaluateQuality({
      agent: agent.name,
      task: task.description,
      output: output.content,
      ...(failureReason ? { failureReason } : {}),
    }, deps.signal);
    throwIfAborted(deps.signal);

    if (quality.status === 'PASS') {
      return { content: output.content, attempts, unverified: false };
    }

    if (quality.status === 'FAIL') {
      attempts += 1;
      if (attempts >= MAX_RETRIES) {
        log.warn('Retries exhausted', { agent: agent.name, attempts: MAX_RETRIES + 1 });
        return { content: output.content, attempts, unverified: false };
      }
      const issuesText = quality.issues.map((it) => `- ${it.description}`).join('\n');
      deps.onPhase?.('THINKING');
      output = await agent.execute(
        {
          ...task,
          description:
            `${task.description}\n\n# ملاحظات المراجع:\n${issuesText}\n\nحسّن ردك.`,
        },
        context, deps.signal ? { signal: deps.signal } : {},
      );
      throwIfAborted(deps.signal);
      continue;
    }

    if (quality.status === 'REVIEW_ERROR' && output.content.trim() !== '') {
      log.warn('Reviewer unavailable — degraded pass', { agent: agent.name });
      return { content: output.content, attempts, unverified: true };
    }
    if (task.verificationRequired) throw new Error('تعذّر التحقق من المخرج (REVIEW_ERROR)');
    return { content: output.content, attempts, unverified: true };
  }

  return { content: output.content, attempts, unverified: false };
}

export async function runTask(deps: TaskRunnerDeps, input: TaskRunInput): Promise<TaskRunResult> {
  const { task, index, total, context, prevOutput } = input;
  const taskStart = Date.now();

  try {
    throwIfAborted(deps.signal);
    const agent = deps.selectAgent(task);
    if (!agent) {
      throw new Error('لا وكيل مناسب لهذه المهمة');
    }
    deps.onAgentActive?.(agent.name);

    const enrichedTask = enrichTask(task, prevOutput);
    log.info('Task start', { index: index + 1, of: total, agent: agent.name });

    const quality = await runQualityLoop(deps, agent, enrichedTask, context);
    let finalContent = await applyMarkers(deps, agent.name, await applyMcpCalls(quality.content, context, deps));

    if (quality.attempts >= MAX_RETRIES && !quality.unverified) {
      finalContent =
        `[WARN] [الرد لم يجتز المراجعة بعد ${MAX_RETRIES + 1} محاولات — ` +
        `قد يكون غير كامل]\n\n` + finalContent;
    }

    const header =
      total > 1
        ? `─── المهمة ${index + 1}: ${task.description.split('\n')[0]} ───\n`
        : '';
    const rendered = header + finalContent;

    deps.enqueueSpeech(finalContent, agent.name);

    if (agent.name === 'mentor' && !quality.unverified) {
      await extractAndSaveSkill(task.description, quality.content);
    }

    return {
      rendered,
      rawOutput: quality.content,
      summary: { id: task.id, agentName: task.agentName, status: 'done', elapsedMs: Date.now() - taskStart },
      unverified: quality.unverified,
      agentUsed: agent.name,
    };
  } catch (err) {
    if (err instanceof RunCancelledError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    log.error('Task failed', {
      taskId: task.id,
      agent: task.agentName,
      message: msg,
    });
    deps.onAgentActive?.(null);

    return {
      rendered:
        `─── المهمة ${index + 1}/${total}: ${task.description.split('\n')[0]} ───\n` +
        `[FAIL] فشلت: ${msg}`,
      rawOutput: '',
      summary: { id: task.id, agentName: task.agentName, status: 'failed', error: msg, elapsedMs: Date.now() - taskStart },
      unverified: false,
      agentUsed: null,
    };
  }
}
