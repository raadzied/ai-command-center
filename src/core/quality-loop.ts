import { MAX_RETRIES } from './quality-gate.js';
import { throwIfAborted } from './run-control.js';
import { logger as log } from '../llm/logger.js';
import type { TaskAgent, TaskRunnerDeps } from './task-runner.js';
import type { Context, Task } from '../types.js';

export interface QualityLoopResult {
  readonly content: string;
  readonly attempts: number;
  readonly unverified: boolean;
}

export interface QualityLoopHooks {
  // يُطبَّق بعد كل تنفيذ وقبل تقييم الجودة (لتنظيف وسوم الاستشارة).
  readonly transformOutput?: (content: string) => Promise<string>;
}

// ينفّذ الوكيل ثم يمرّر الرد عبر بوابة الجودة مع محاولات الإصلاح
export async function runQualityLoop(
  deps: TaskRunnerDeps,
  agent: TaskAgent,
  task: Task,
  context: Context,
  hooks?: QualityLoopHooks,
): Promise<QualityLoopResult> {
  const afterExecute = async (content: string): Promise<{ content: string }> => ({
    content: hooks?.transformOutput ? await hooks.transformOutput(content) : content,
  });

  throwIfAborted(deps.signal);
  deps.onPhase?.('THINKING');
  let output = await afterExecute(
    (await agent.execute(task, context, deps.signal ? { signal: deps.signal } : {})).content,
  );
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
      output = await afterExecute(
        (
          await agent.execute(
            {
              ...task,
              description:
                `${task.description}\n\n# ملاحظات المراجع:\n${issuesText}\n\nحسّن ردك.`,
            },
            context, deps.signal ? { signal: deps.signal } : {},
          )
        ).content,
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
