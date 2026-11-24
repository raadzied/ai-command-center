import { logger as log } from '../llm/logger.js';
import { extractAndSaveSkill } from './skills.js';
import { MAX_RETRIES } from './quality-gate.js';
import { validateTscFiles } from '../tools/tsc-validate.js';
import { processMcpMarkers } from '../tools/mcp-markers.js';
import { RunCancelledError, throwIfAborted } from './run-control.js';
import { runQualityLoop } from './quality-loop.js';
import { resolveConsultations } from './agent-bus.js';
import { emitActivity } from './hud-activity.js';
import type { ActivityEmitter } from './hud-activity.js';
import type { ConsultEvent } from './agent-bus.js';
import type { SharedBoard } from './shared-board.js';
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
  board?: SharedBoard;
  onConsult?: (event: ConsultEvent) => void;
  onActivity?: ActivityEmitter;
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

async function applyMcpCalls(content: string, context: Context, deps: TaskRunnerDeps): Promise<string> {
  if (!content.includes('[[MCP_CALL:')) return content;
  deps.onPhase?.('APPLYING_CHANGES');
  emitActivity(deps.onActivity, { nodeId: 'mcp', state: 'active' });
  try {
    const result = await processMcpMarkers(content, context.scope, deps.signal);
    emitActivity(deps.onActivity, {
      nodeId: 'mcp', state: 'done', detail: `${result.executedCount} calls`, ttlMs: 2500,
    });
    if (result.toolOutputs.length === 0) return result.cleanedContent;
    log.info('MCP markers executed', { count: result.executedCount });
    return `${result.cleanedContent}\n\n# MCP Tool Results\n${result.toolOutputs.join('\n')}`;
  } catch (err) {
    emitActivity(deps.onActivity, {
      nodeId: 'mcp', state: 'error',
      detail: err instanceof Error ? err.message : String(err), ttlMs: 2500,
    });
    throw err;
  }
}

async function applyMarkers(
  deps: TaskRunnerDeps,
  agentName: AgentName,
  content: string,
): Promise<string> {
  if (agentName !== 'coder') return content;
  throwIfAborted(deps.signal); deps.onPhase?.('APPLYING_CHANGES');
  const hasMarkers = content.includes('[[MKDIR:') || content.includes('[WRITE_FILE:');
  if (hasMarkers) emitActivity(deps.onActivity, { nodeId: 'fs', state: 'active' });
  let markerResult: MarkerResult;
  try {
    markerResult = await deps.processMarkers(content, deps.signal, deps.onPhase);
  } catch (err) {
    if (hasMarkers) emitActivity(deps.onActivity, {
      nodeId: 'fs', state: 'error',
      detail: err instanceof Error ? err.message : String(err), ttlMs: 2500,
    });
    throw err;
  }
  if (hasMarkers) emitActivity(deps.onActivity, {
    nodeId: 'fs', state: 'done', detail: `${markerResult.wroteCount} writes`, ttlMs: 2500,
  });
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

function resolvePeer(deps: TaskRunnerDeps, name: AgentName): TaskAgent | null {
  return deps.selectAgent({
    id: `peer-${name}`,
    description: `استشارة من وكيل آخر: ${name}`,
    intent: 'advise',
    agentName: name,
    status: 'pending',
    verificationRequired: false,
    dependsOn: [],
  });
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
    emitActivity(deps.onActivity, { nodeId: agent.name, state: 'active', detail: task.description.split('\n')[0] ?? '' });

    const enrichedTask = enrichTask(task, prevOutput);
    log.info('Task start', { index: index + 1, of: total, agent: agent.name });

    const quality = await runQualityLoop(deps, agent, enrichedTask, context, {
      transformOutput: (content: string): Promise<string> => resolveConsultations(
        agent.name, content, {
          context,
          task: enrichedTask,
          ...(deps.signal ? { signal: deps.signal } : {}),
          ...(deps.board ? { board: deps.board } : {}),
          ...(deps.onConsult ? { onConsult: deps.onConsult } : {}),
          resolvePeer: (name): TaskAgent | null => resolvePeer(deps, name),
        },
      ).then((result): string => result.content),
    });
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
    emitActivity(deps.onActivity, { nodeId: agent.name, state: 'done', detail: task.description.split('\n')[0] ?? '', ttlMs: 2500 });

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
    emitActivity(deps.onActivity, { nodeId: task.agentName, state: 'error', detail: msg, ttlMs: 2500 });

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
