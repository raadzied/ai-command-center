import { logger as log } from '../llm/logger.js';
import { extractAndSaveSkill } from './skills.js';
import { MAX_RETRIES } from './quality-gate.js';
import { validateTscFiles } from '../tools/tsc-validate.js';
import type { MarkerResult } from '../tools/markers.js';
import type {
  AgentName,
  Context,
  QualityInput,
  QualityResult,
  Task,
  TaskSummary,
} from '../types.js';

/** وكيل قابل للتنفيذ — مجموعة فرعية من Agent في registry. */
export type TaskAgent = {
  readonly name: AgentName;
  execute(task: Task, context: Context): Promise<{ content: string }>;
};

/** التبعيات التي يحتاجها تنفيذ مهمة واحدة (مجموعة فرعية من LoopDeps). */
export interface TaskRunnerDeps {
  selectAgent: (task: Task) => TaskAgent | null;
  evaluateQuality: (input: QualityInput) => Promise<QualityResult>;
  processMarkers: (text: string) => Promise<MarkerResult>;
  enqueueSpeech: (text: string, agent: string | null) => void;
  onAgentActive?: (agentName: AgentName | null) => void;
}

export interface TaskRunInput {
  readonly task: Task;
  /** فهرس صفري داخل الخطة المرتّبة. */
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
  const priorContext =
    `# مخرجات المهام السابقة (سياق، ليست طلبًا من المستخدم):\n` +
    `${prevOutput}\n\n# مهمتك:\n${task.description}`;
  return { ...task, description: `${task.description}\n\n${priorContext}` };
}

async function applyMarkers(
  deps: TaskRunnerDeps,
  agentName: AgentName,
  content: string,
): Promise<string> {
  if (agentName !== 'coder') return content;

  const markerResult = await deps.processMarkers(content);
  let display = markerResult.cleanedContent + markerResult.writeStatus;
  if (markerResult.totalMarkers > 0) {
    log.info('Markers processed', {
      total: markerResult.totalMarkers,
      wrote: markerResult.wroteCount,
      rejected: markerResult.rejectedCount,
    });
  }

  const tsFiles = markerResult.wrotePaths.filter(
    (p) => p.endsWith('.ts') || p.endsWith('.tsx'),
  );
  if (tsFiles.length === 0) return display;

  const tscResult = validateTscFiles(tsFiles);
  if (!tscResult.ok) {
    const errLines = tscResult.errors.slice(0, 5).map((e) => `  ${e}`).join('\n');
    display +=
      `\n\n⚠️ الملفات المكتوبة تكسر tsc:\n${errLines}\n` +
      `   أصلحها قبل البناء.`;
    log.warn('Generated files break tsc', { count: tscResult.errors.length });
  }
  return display;
}

interface QualityLoopResult {
  readonly content: string;
  readonly attempts: number;
  readonly unverified: boolean;
}

async function runQualityLoop(
  deps: TaskRunnerDeps,
  agent: TaskAgent,
  task: Task,
  context: Context,
): Promise<QualityLoopResult> {
  let output = await agent.execute(task, context);
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    const failureReason = output.content.includes('⚠️ [الرد مقطوع')
      ? ('MAX_TOKENS' as const)
      : undefined;
    if (failureReason) {
      log.warn('Detected truncation', { reason: failureReason, agent: agent.name });
    }

    const quality = await deps.evaluateQuality({
      agent: agent.name,
      task: task.description,
      output: output.content,
      ...(failureReason ? { failureReason } : {}),
    });

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
      output = await agent.execute(
        {
          ...task,
          description:
            `${task.description}\n\n# ملاحظات المراجع:\n${issuesText}\n\nحسّن ردك.`,
        },
        context,
      );
      continue;
    }

    // REVIEW_ERROR
    if (task.verificationRequired) {
      throw new Error('تعذّر التحقق من المخرج (REVIEW_ERROR)');
    }
    return { content: output.content, attempts, unverified: true };
  }

  return { content: output.content, attempts, unverified: false };
}

/** ينفّذ مهمة واحدة: وكيل → Quality Gate → markers → tsc → نطق → ملخص. */
export async function runTask(
  deps: TaskRunnerDeps,
  input: TaskRunInput,
): Promise<TaskRunResult> {
  const { task, index, total, context, prevOutput } = input;
  const taskStart = Date.now();

  try {
    const agent = deps.selectAgent(task);
    if (!agent) {
      throw new Error('لا وكيل مناسب لهذه المهمة');
    }
    deps.onAgentActive?.(agent.name);

    const enrichedTask = enrichTask(task, prevOutput);
    log.info('Task start', { index: index + 1, of: total, agent: agent.name });

    const quality = await runQualityLoop(deps, agent, enrichedTask, context);
    let finalContent = await applyMarkers(deps, agent.name, quality.content);

    if (quality.attempts >= MAX_RETRIES && !quality.unverified) {
      finalContent =
        `⚠️ [الرد لم يجتز المراجعة بعد ${MAX_RETRIES + 1} محاولات — ` +
        `قد يكون غير كامل]\n\n` + finalContent;
    }

    const header =
      total > 1
        ? `─── المهمة ${index + 1}: ${task.description.split('\n')[0]} ───\n`
        : '';
    const rendered = header + finalContent;

    // نطق واحد فقط لمخرج المهمة (بعد معالجة markers ووسوم tsc)
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
        `❌ فشلت: ${msg}`,
      rawOutput: '',
      summary: { id: task.id, agentName: task.agentName, status: 'failed', error: msg, elapsedMs: Date.now() - taskStart },
      unverified: false,
      agentUsed: null,
    };
  }
}
