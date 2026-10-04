import { z } from 'zod';
import { getDb } from '../memory/db.js';
import { saveSkill } from '../memory/store.js';
import { retrieveSkills } from '../memory/retrieve.js';
import { embed } from '../llm/classifier.cloud.js';
import { chat } from '../llm/chat.js';
import { extractJson } from '../utils/json.js';
import { logger as log } from '../llm/logger.js';

// أقل طول للحوار ليستحق الاستخراج
const MIN_OUTPUT_LEN = 300;

// مسافة أقل من هذا = نفس الفكرة موجودة (تخطَّ الحفظ)
const DUPLICATE_THRESHOLD = 0.35;

const EXTRACTOR_SYSTEM = `أنت محلل معارف. اقرأ الحوار بين مستخدم ومساعد تعليمي، واستخرج المهارة الأساسية التي تعلمها المستخدم.

أعد JSON فقط بالشكل التالي:
{"name":"عنوان قصير للمهارة 3-7 كلمات","content":"الدرس الأساسي في 1-3 جمل مفيدة","category":"concept"}

الفئات المتاحة: concept, coding, design, tool, other.

إن كان الحوار غير مفيد كدرس مستقل (تحية، سؤال شخصي، طلب تصميم، كود فقط)، أعد:
{"skip":true}

لا تكتب أي شيء خارج JSON.`;

const ExtractedSchema = z.union([
  z.object({ skip: z.literal(true) }),
  z.object({
    skip: z.literal(false).optional(),
    name: z.string().min(3).max(100),
    content: z.string().min(10).max(600),
    category: z.enum(['concept', 'coding', 'design', 'tool', 'other']),
  }),
]);

// يحاول استخراج مهارة من رد Mentor ويحفظها.
// لا يرمي أبدًا — الفشل يُسجَّل ويُتجاهَل.
export async function extractAndSaveSkill(
  userInput: string,
  agentOutput: string,
): Promise<void> {
  if (agentOutput.length < MIN_OUTPUT_LEN) return;

  try {
    const userMsg = `# حوار:\n\nالمستخدم: ${userInput}\n\nالمساعد: ${agentOutput}`;

    const raw = await chat(EXTRACTOR_SYSTEM, userMsg, {
      temperature: 0.2,
      maxTokens: 400,
    });

    const json = extractJson(raw);
    if (!json) {
      log.warn('Skill extractor returned no JSON');
      return;
    }

    const parsed = ExtractedSchema.safeParse(json);
    if (!parsed.success) {
      log.warn('Skill extractor invalid shape');
      return;
    }

    if ('skip' in parsed.data && parsed.data.skip === true) {
      log.info('Skill extraction skipped by model');
      return;
    }

    const data = parsed.data as {
      name: string;
      content: string;
      category: string;
    };

    // افحص إن كانت هناك مهارة مشابهة (نفس الفكرة)
    const candidateVec = await embed(`${data.name}: ${data.content}`);
    const db = getDb();
    const similar = retrieveSkills(db, candidateVec, 1);

  const top = similar[0];
  if (top && top.distance < DUPLICATE_THRESHOLD) {
    log.info('Skill already exists, skipping', {
      existing: top.name,
      distance: top.distance.toFixed(3),
    });
    return;
  }

    saveSkill(db, {
      name: data.name,
      category: data.category,
      content: data.content,
      proficiency: 1,
      embedding: candidateVec,
    });

    log.info('Skill saved', { name: data.name, category: data.category });
  } catch (err) {
    log.warn('Skill extraction failed', { err });
  }
}
