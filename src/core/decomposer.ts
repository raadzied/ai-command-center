import { z } from 'zod';
import type { Task, Intent } from '../types.js';
import { chatGroq } from '../llm/chat.js';
import { intentToAgentName } from './router.js';
import { extractJson } from '../utils/json.js';
import { logger as log } from '../llm/logger.js';

// كلمات تُشير إلى وجود أكثر من مهمة
const SPLIT_MARKERS = [' ثم ', ' بعدها ', ' بعد ذلك ', '، ثم', '، وبعدها'];

// وصف مهمة من المحلل قبل تحويلها إلى Task
export interface DecomposedTask {
  id: string;
  description: string;
  intent: Exclude<Intent, 'chat'>;
  dependsOn: string[];
}

const DecomposedTaskSchema = z.object({
  id: z.string().min(1).max(20),
  description: z.string().min(3).max(500),
  intent: z.enum(['learn', 'build', 'design']),
  dependsOn: z.array(z.string()).max(5).default([]),
});

const DecompositionSchema = z.object({
  tasks: z.array(DecomposedTaskSchema).min(1).max(5),
});

const DECOMPOSER_SYSTEM = `أنت محلل مهام دقيق.
قسّم طلب المستخدم إلى مهام متسلسلة، كل مهمة تُنفَّذ بواسطة وكيل واحد.

الوكلاء المتاحون:
- learn → mentor (تعليم وشرح مفاهيم)
- build → coder (كتابة كود، أو اختبار كود، أو إصلاح أخطاء)
- design → designer (تصميم واجهات وأنظمة تصميم)

قواعد التقسيم الصارمة:

1) علامات التقسيم الإلزامية — إن وُجد أحدها، يجب التقسيم:
   - "ثم"
   - "بعدها"
   - "بعد ذلك"
   - "أولاً...ثانياً"
   - "و" تفصل فعلين مختلفين (اكتب واختبر، صمم وابنِ)

2) مثال على طلب بسيط (مهمة واحدة):
   "علّمني ما هو HTTP"
   → learn واحد

3) مثال على طلب مركّب (مهمتان):
   "علّمني HTTP ثم اكتب دالة"
   → t1=learn، t2=build مع dependsOn=["t1"]

4) مثال على 3 مهام:
   "صمم واجهة، ثم اكتب React، ثم اختبر الكود"
   → t1=design، t2=build، t3=build (اختبار = build)
     dependsOn: t1=[], t2=["t1"], t3=["t2"]

5) "اختبر" أو "تحقق" أو "صحّح" تُعتبر دائمًا build (لا learn).

6) كل مهمة لها معرف فريد t1, t2, t3...

7) dependsOn: مصفوفة معرفات يجب اكتمالها أولاً. أول مهمة دائمًا [].

8) لا تتجاوز 5 مهام.

أعد JSON فقط:
{"tasks":[{"id":"t1","description":"...","intent":"learn|build|design","dependsOn":[]}]}`;

// يفكك طلب المستخدم إلى مهام. إن فشل، يعيد [] (fallback آمِن).
export async function decompose(userInput: string): Promise<DecomposedTask[]> {
  try {
    const raw = await chatGroq(DECOMPOSER_SYSTEM, userInput, {
      temperature: 0,
      maxTokens: 800,
      preferredModel: 'openai/gpt-oss-120b',
    });

    const json = extractJson(raw);
    if (!json) {
      log.warn('Decomposer returned no JSON');
      return [];
    }

    const parsed = DecompositionSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('Decomposer schema mismatch', {
        issues: parsed.error.issues.map(
          (i) => i.path.join('.') + ': ' + i.message,
        ),
      });
      return [];
    }

    // فحص حتمي: إن وُجدت علامة تقسيم، يجب أن يكون هناك مهمتان+
    const hasMarker = SPLIT_MARKERS.some((m) => userInput.includes(m));
    if (hasMarker && parsed.data.tasks.length === 1) {
      log.warn('Split marker found but only 1 task returned — retrying');
      const retryRaw = await chatGroq(
        DECOMPOSER_SYSTEM +
          '\n\nتحذير: الطلب يحتوي علامة تقسيم واضحة، فيجب أن تعيد مهمتين على الأقل.',
        userInput,
        { temperature: 0, maxTokens: 800, preferredModel: 'openai/gpt-oss-120b' },
      );
      const retryJson = extractJson(retryRaw);
      if (retryJson) {
        const retryParsed = DecompositionSchema.safeParse(retryJson);
        if (retryParsed.success && retryParsed.data.tasks.length > 1) {
          log.info('Retry succeeded', { count: retryParsed.data.tasks.length });
          return retryParsed.data.tasks;
        }
      }
      log.warn('Retry did not produce multiple tasks, keeping original');
    }

    log.info('Decomposition succeeded', {
      count: parsed.data.tasks.length,
    });
    return parsed.data.tasks;
  } catch (err) {
    log.warn('Decomposer failed', { err });
    return [];
  }
}

// يحوّل DecomposedTask إلى Task جاهز للتنفيذ
export function toTasks(decomposed: DecomposedTask[]): Task[] {
  return decomposed.map((d) => ({
    id: d.id,
    description: d.description,
    intent: d.intent,
    agentName: intentToAgentName(d.intent),
    status: 'pending' as const,
    verificationRequired: d.intent === 'build',
    dependsOn: d.dependsOn,
  }));
}

// ترتيب المهام طوبولوجيًا — يرمي عند الدورات أو التبعيات الناقصة.
export function topologicalSort(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sorted: Task[] = [];
  const visited = new Set<string>(); const visiting = new Set<string>();

  function visit(id: string): void { if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Dependency cycle detected at: ${id}`);
    const task = byId.get(id);
    if (!task) throw new Error(`Missing dependency: ${id}`);
    visiting.add(id);
    for (const dep of task.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
    sorted.push(task);
  }

  for (const t of tasks) visit(t.id);
  return sorted;
}
