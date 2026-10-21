import { createPlan } from './planner.js';
import { selectAgent } from './router.js';
import { topologicalSort } from './decomposer.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';
import { buildMemoryContext, saveToMemory } from './memory.js';
import { extractAndSaveSkill } from './skills.js';
import { evaluateQuality, MAX_RETRIES } from './quality-gate.js';
import { processMarkers } from '../tools/markers.js';
import { validateTscFiles } from '../tools/tsc-validate.js';

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
}

// يعالج مدخل المستخدم كاملاً (ينفّذ مخطط مهام متعددًا)
export async function processInput(input: string): Promise<LoopResult> {
  const start = Date.now();
  const trimmed = input.trim();

  if (!trimmed) {
    return { intent: 'empty', agentUsed: null, content: '', elapsedMs: 0 };
  }

  const context = await buildMemoryContext(trimmed);
  const plan = await createPlan(trimmed, context);

  // دردشة عادية
  if (plan.isChat) {
    log.info('Handling as chat');
    const reply = await chat(CHAT_SYSTEM, trimmed, {
      temperature: 0.6,
      maxTokens: 800,
    });
    await saveToMemory(trimmed, reply.trim(), null);
    return {
      intent: 'chat',
      agentUsed: null,
      content: reply.trim(),
      elapsedMs: Date.now() - start,
    };
  }

  if (plan.tasks.length === 0) {
    return {
      intent: plan.intent,
      agentUsed: null,
      content: 'لم أتمكن من بناء مهمة من هذا الطلب.',
      elapsedMs: Date.now() - start,
    };
  }

  // نفّذ المهام بالترتيب الطوبولوجي
  const ordered = topologicalSort(plan.tasks);
  log.info('Executing task graph', { total: ordered.length });

  const parts: string[] = [];
  let prevOutput = '';
  let lastAgent: string | null = null;
  let anyUnverified = false;

  for (let i = 0; i < ordered.length; i++) {
    const task = ordered[i];
    if (!task) continue;

    const agent = selectAgent(task);
    if (!agent) {
      parts.push(`[مهمة ${i + 1}] لا وكيل مناسب`);
      continue;
    }

    // مرّر مخرج المهمة السابقة كسياق
    const enrichedTask =
      prevOutput.length > 0
        ? {
            ...task,
            description: `${task.description}\n\n# نتائج المهام السابقة:\n${prevOutput}`,
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

      const quality = await evaluateQuality({
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
        parts.push(
          `[مهمة ${i + 1}] ⚠️ تعذّر التحقق — لم يُعرض مخرج.`,
        );
        prevOutput = '';
        continue;
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
    // (prevOutput و saveToMemory أدناه يستخدمان output.content
    // الخام — حتى تعرف المهام التالية أن ملفًا كُتب)
    let displayContent = output.content;
    if (agent.name === 'coder') {
      const markerResult = await processMarkers(output.content);
      displayContent =
        markerResult.cleanedContent + markerResult.writeStatus;
      if (markerResult.totalMarkers > 0) {
        log.info('Markers processed', {
          total: markerResult.totalMarkers,
          wrote: markerResult.wroteCount,
          rejected: markerResult.rejectedCount,
        });
      }

      // فحص tsc للملفات .ts المكتوبة داخل src/
      if (markerResult.wrotePaths.length > 0) {
        const tsFiles = markerResult.wrotePaths.filter(
          (p) => (p.endsWith('.ts') || p.endsWith('.tsx')) &&
                 p.replace(/\\/g, '/').startsWith('src/'),
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

    // احفظ كل مهمة كسياق للمهمة التالية وللذاكرة
    prevOutput = output.content;

    await saveToMemory(
      `[${task.id}] ${task.description}`,
      output.content,
      agent.name,
    );

    // استخرج مهارة إن كان Mentor ولم يكن unverified
    if (agent.name === 'mentor' && !unverified) {
      await extractAndSaveSkill(task.description, output.content);
    }
  }

  const combined = parts.join('\n\n');
  const content = anyUnverified
    ? `⚠️ [بعض الردود غير مُتحققة — تعذّر تشغيل المراجع]\n\n${combined}`
    : combined;

  return {
    intent: plan.intent,
    agentUsed: lastAgent,
    content,
    elapsedMs: Date.now() - start,
  };
}
