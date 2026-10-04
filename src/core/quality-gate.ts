import { z } from 'zod';
import type {
  AgentName,
  QualityInput,
  QualityResult,
  QualityIssue,
} from '../types.js';
import { chatGroq } from '../llm/chat.js';
import { extractJson } from '../utils/json.js';
import { logger as log } from '../llm/logger.js';

// حد أدنى للقبول — أقل من هذا يعني FAIL
export const QUALITY_THRESHOLD = 0.7;

// عدد محاولات الإصلاح الأقصى
export const MAX_RETRIES = 2;

// معايير كل وكيل
const CHECKS: Record<AgentName, string[]> = {
  mentor: [
    'هل بدأ الشرح بـ "لماذا" قبل "كيف"؟',
    'هل طرح تحديًا عمليًا في النهاية؟',
    'هل الرد أقل من 400 كلمة تقريبًا؟',
    'هل استخدم العربية الفصحى المبسطة؟',
  ],
  coder: [
    'هل الكود صحيح نحويًا؟',
    'هل الكود منطقي وخالٍ من أخطاء واضحة؟',
    'هل يُحقق الكود المتطلب المذكور حرفيًا؟',
    'هل تتوفر كل المعلومات والبيانات اللازمة لتنفيذ الطلب؟',
    'إن كانت المعلومات مفقودة (لا mapping، لا مصدر بيانات)، هل اعترف الكود بذلك بدل افتراض بيانات غير موجودة؟',
    'هل عالج حالات الحد (فارغ، null، undefined)؟',
    'هل أضاف اختبارًا أو مثال استخدام؟',
  ],
  designer: [
    'هل وصف نظام تصميم كامل (ألوان، خطوط، مسافات)؟',
    'هل برَّر القرارات التصميمية ("اخترت X لأن Y")؟',
    'هل راعى RTL للسياق العربي؟',
    'هل ذكر بنية الصفحة الهرمية؟',
  ],
};

const SYSTEM_PROMPT = `أنت مراجع جودة صارم.
تقييمك يعتمد على قائمة معايير محددة، وليس على ذوقك الشخصي.

أعد JSON فقط بالشكل التالي:
{"score":0.0-1.0,"issues":[{"description":"..."}],"summary":"جملة واحدة"}

قواعد:
- score=1.0 يعني كل المعايير متحققة تمامًا.
- score=0.0 يعني فشل تام.
- issues: قائمة مختصرة بالمشاكل (0-3 عناصر).
- summary: جملة واحدة تصف الجودة.
- لا تكتب أي شيء خارج JSON.

قاعدة إضافية للكود:
إذا كان الطلب غير قابل للتحقيق بالمعطيات المتاحة (مثل:
تحويل رقم إلى اسم مستخدم بلا mapping أو مصدر بيانات)، فلا
تعتبره PASS لمجرد أن الكود valid TypeScript. هذا requirement
غير قابل للتحقيق، ويستحق score منخفض. الكود يجب أن يعترف
بالقيود بدل افتراض مصادر غير موجودة.`;

const ReviewSchema = z.object({
  score: z.coerce.number().min(0).max(1),
  issues: z
    .array(z.object({ description: z.string().min(1) }))
    .max(5)
    .default([]),
  summary: z.string().max(500).default('No summary provided'),
});

// يقيّم مخرج وكيل
export async function evaluateQuality(
  input: QualityInput,
): Promise<QualityResult> {
  try {
    if (input.failureReason) {
      log.warn('Review reason', {
        reason: input.failureReason,
        agent: input.agent,
      });
    }

    const criteria = CHECKS[input.agent];
    const userMsg = buildUserMessage(criteria, input);

    const raw = await chatGroq(SYSTEM_PROMPT, userMsg, {
      temperature: 0.1,
      maxTokens: 500,
    });

    const json = extractJson(raw);
    if (!json) {
      return reviewError('no JSON');
    }

    log.debug('Reviewer raw response', { raw: raw.slice(0, 500) });

    const parsed = ReviewSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('Reviewer schema mismatch', {
        issues: parsed.error.issues.map((i) => i.path.join('.') + ': ' + i.message),
        raw: JSON.stringify(json).slice(0, 400),
      });
      return reviewError('invalid shape');
    }

    const status = parsed.data.score >= QUALITY_THRESHOLD ? 'PASS' : 'FAIL';
    const issues: QualityIssue[] = parsed.data.issues.map((i) => ({
      description: i.description,
    }));

    log.info('Quality evaluated', {
      agent: input.agent,
      score: parsed.data.score.toFixed(2),
      status,
    });

    return {
      status,
      score: parsed.data.score,
      issues,
      summary: parsed.data.summary,
    };
  } catch (err) {
    log.warn('Quality gate exception', {
      message: err instanceof Error ? err.message : String(err),
    });
    return reviewError('exception');
  }
}

// يبني رسالة المراجعة
function buildUserMessage(
  criteria: string[],
  input: QualityInput,
): string {
  const criteriaText = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n');
  return [
    `# الوكيل: ${input.agent}`,
    `# المهمة:`,
    input.task,
    ``,
    `# مخرج الوكيل:`,
    input.output,
    ``,
    `# معايير التقييم:`,
    criteriaText,
  ].join('\n');
}

// عند فشل المراجع، نُرجع REVIEW_ERROR — القرار النهائي
// للمتصل (loop.ts) بناءً على verificationRequired.
function reviewError(reason: string): QualityResult {
  log.warn('Review error', { reason });
  return {
    status: 'REVIEW_ERROR',
    score: 0,
    issues: [],
    summary: `Review unavailable: ${reason}`,
  };
}
