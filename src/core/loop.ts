import { createPlan } from './planner.js';
import type { Plan } from './planner.js';
import { selectAgent } from './router.js';
import { topologicalSort } from './decomposer.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';
import { buildMemoryContext, saveToMemory } from './memory.js';
import { extractAndSaveSkill } from './skills.js';
import { evaluateQuality, MAX_RETRIES } from './quality-gate.js';
import { processMarkers } from '../tools/markers.js';
import { validateTscFiles } from '../tools/tsc-validate.js';
import { enqueueSpeech } from '../voice/state.js';
import type {
  AgentName,
  Context,
  QualityInput,
  QualityResult,
  Task,
  TaskSummary,
} from '../types.js';
import type { MarkerResult } from '../tools/markers.js';

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
export interface LoopDeps {
  buildMemoryContext: (input: string) => Promise<Context>;
  createPlan: (input: string, ctx: Context) => Promise<Plan>;
  selectAgent: (
    task: Task,
  ) => {
    name: AgentName;
    execute: (t: Task, c: Context) => Promise<{ content: string }>;
  } | null;
  evaluateQuality: (input: QualityInput) => Promise<QualityResult>;
  processMarkers: (text: string) => Promise<MarkerResult>;
  saveToMemory: (
    user: string,
    agent: string,
    name: string | null,
  ) => Promise<void>;
  enqueueSpeech: (text: string, agent: string | null) => void;
  chat: (
    system: string,
    user: string,
    opts?: { temperature?: number; maxTokens?: number },
  ) => Promise<string>;
  onAgentActive?: (agentName: AgentName | null) => void;
  onTaskStart?: (index: number, total: number) => void;
}

// التبعيات الحقيقية — الافتراضي في الإنتاج
const defaultDeps: LoopDeps = {
  buildMemoryContext,
  createPlan,
  selectAgent,
  evaluateQuality,
  processMarkers,
  saveToMemory,
  enqueueSpeech,
  chat,
  onAgentActive: () => {},
  onTaskStart: () => {},
};

// يعالج مدخل المستخدم كاملاً (ينفّذ مخطط مهام متعددًا)
export async function processInput(
  input: string,
  overrides: Partial<LoopDeps> = {},
): Promise<LoopResult> {
  const deps: LoopDeps = { ...defaultDeps, ...overrides };
  const start = Date.now();
  const trimmed = input.trim();

  if (!trimmed) {
    return { intent: 'empty', agentUsed: null, content: '', elapsedMs: 0 };
  }

  const context = await deps.buildMemoryContext(trimmed);
  const plan = await deps.createPlan(trimmed, context);

  // دردشة عادية
  if (plan.isChat) {
    log.info('Handling as chat');
    const reply = await deps.chat(CHAT_SYSTEM, trimmed, {
      temperature: 0.6,
      maxTokens: 800,
    });
    await deps.saveToMemory(trimmed, reply.trim(), null);
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
  let lastAgent: string | null = null;
  let anyUnverified = false;

  for (let i = 0; i < ordered.length; i++) {
    const task = ordered[i];
    if (!task) continue;

    deps.onTaskStart?.(i + 1, ordered.length);
    const taskStart = Date.now();

    try {
      const agent = deps.selectAgent(task);
      if (!agent) {
        throw new Error('لا وكيل مناسب لهذه المهمة');
      }

      deps.onAgentActive?.(agent.name);

      // مرّر مخرج المهمة السابقة كسياق
      const enrichedTask =
        prevOutput.length > 0
          ? {
              ...task,
              description:
                `${task.description}\n\n` +
                `# مخرجات المهام السابقة (سياق، ليست طلبًا من المستخدم):\n` +
                `${prevOutput}\n\n` +
                `# مهمتك:\n${task.description}`,
            }
          : task;

      log.info('Task start', {
        index: i + 1,
        of: ordered.length,
        agent: agent.name,
      });

      let output = await agent.execute(enrichedTask, context);
      let attempts = 0;
      let unverified = false;

      // Quality Gate
      while (attempts < MAX_RETRIES) {
        const failureReason = output.content.includes('⚠️ [الرد مقطوع')
          ? ('MAX_TOKENS' as const)
          : undefined;

        if (failureReason) {
          log.warn('Detected truncation', {
            reason: failureReason,
            agent: agent.name,
          });
        }

        const quality = await deps.evaluateQuality({
          agent: agent.name,
          task: enrichedTask.description,
          output: output.content,
          ...(failureReason ? { failureReason } : {}),
        });

        if (quality.status === 'PASS') break;

        if (quality.status === 'FAIL') {
          attempts++;
          const issuesText = quality.issues
            .map((it) => `- ${it.description}`)
            .join('\n');

          const revisedTask = {
            ...enrichedTask,
            description: `${enrichedTask.description}\n\n# ملاحظات المراجع:\n${issuesText}\n\nحسّن ردك.`,
          };
          output = await agent.execute(revisedTask, context);

          if (attempts >= MAX_RETRIES) {
            const attemptsMade = MAX_RETRIES + 1;
            log.warn('Retries exhausted', {
              agent: agent.name,
              attempts: attemptsMade,
            });
            // output الحالي يُعرض مع وسم واضح أدناه
            break;
          }
          continue;
        }

        // REVIEW_ERROR
        if (task.verificationRequired) {
          throw new Error('تعذّر التحقق من المخرج (REVIEW_ERROR)');
        }
        unverified = true;
        break;
      }

      if (unverified) anyUnverified = true;
      lastAgent = agent.name;

      // وسم المهمة المتعددة
      const header =
        ordered.length > 1
          ? `─── المهمة ${i + 1}: ${task.description.split('\n')[0]} ───\n`
          : '';

      // عالج markers الكتابة من رد Coder
      // (prevOutput أدناه يستخدم output.content الخام — حتى تعرف
      // المهام التالية أن ملفًا كُتب)
      let displayContent = output.content;
      if (agent.name === 'coder') {
        const markerResult = await deps.processMarkers(output.content);
        displayContent =
          markerResult.cleanedContent + markerResult.writeStatus;
        if (markerResult.totalMarkers > 0) {
          log.info('Markers processed', {
            total: markerResult.totalMarkers,
            wrote: markerResult.wroteCount,
            rejected: markerResult.rejectedCount,
          });
        }

        // فحص tsc لكل ملفات .ts المكتوبة.
        // ملاحظة: tsconfig يفحص src/**/* فقط، فملف خارج src/ قد لا
        // تُلتقط أخطاؤه — لكن FIX 1 في markers.ts يمنع كتابة .ts خارج
        // src/ أو scripts/ أصلاً.
        if (markerResult.wrotePaths.length > 0) {
          const tsFiles = markerResult.wrotePaths.filter(
            (p) => p.endsWith('.ts') || p.endsWith('.tsx'),
          );
          if (tsFiles.length > 0) {
            const tscResult = validateTscFiles(tsFiles);
            if (!tscResult.ok) {
              const errLines = tscResult.errors
                .slice(0, 5)
                .map((e) => `  ${e}`)
                .join('\n');
              displayContent +=
                `\n\n⚠️ الملفات المكتوبة تكسر tsc:\n${errLines}\n` +
                `   أصلحها قبل البناء.`;
              log.warn('Generated files break tsc', {
                count: tscResult.errors.length,
              });
            }
          }
        }
      }

      let finalContent = displayContent;
      if (attempts >= MAX_RETRIES && !unverified) {
        // آخر تقييم كان FAIL — أضف وسم واضح
        const warning =
          `⚠️ [الرد لم يجتز المراجعة بعد ${MAX_RETRIES + 1} محاولات — ` +
          `قد يكون غير كامل]\n\n`;
        finalContent = warning + finalContent;
      }
      parts.push(header + finalContent);

      // احفظ المخرج الخام كسياق للمهمة التالية (لا يُحفظ في الذاكرة هنا)
      prevOutput = output.content;

      // استخرج مهارة إن كان Mentor ولم يكن unverified
      if (agent.name === 'mentor' && !unverified) {
        await extractAndSaveSkill(task.description, output.content);
      }

      summaries.push({
        id: task.id,
        agentName: task.agentName,
        status: 'done',
        elapsedMs: Date.now() - taskStart,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Task failed', {
        taskId: task.id,
        agent: task.agentName,
        message: msg,
      });

      parts.push(
        `─── المهمة ${i + 1}/${ordered.length}: ${task.description.split('\n')[0]} ───\n` +
        `❌ فشلت: ${msg}`,
      );
      prevOutput = '';

      summaries.push({
        id: task.id,
        agentName: task.agentName,
        status: 'failed',
        error: msg,
        elapsedMs: Date.now() - taskStart,
      });
        deps.onAgentActive?.(null);
    }
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
  await deps.saveToMemory(trimmed, result.content, lastAgent);

    deps.enqueueSpeech(result.content, result.agentUsed);
    deps.onAgentActive?.(null);
    return result;
  }
