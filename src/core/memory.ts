import type { Context, MemoryItem } from '../types.js';
import { getDb } from '../memory/db.js';
import { embed } from '../llm/classifier.cloud.js';
import { retrieveUnified } from '../memory/retrieve.js';
import { saveConversation } from '../memory/store.js';
import { logger as log } from '../llm/logger.js';

// كم عنصرًا نسترجع من الذاكرة قبل كل مهمة
const MEMORY_LIMIT = 5;

// أقصى طول يُحفظ من نص واحد (لتفادي تضخم DB)
const MAX_CONTENT_LEN = 2000;

// عتبة الصلة على مسافة L2 (غير مُطبَّعة).
// مبنية على تحليل فعلي لـ 178 متجهاً:
// - محتوى ذو صلة: 0.000 – 0.153
// - محتوى غير ذي صلة: 0.561 – 0.614
// - الفاصل الفارغ: 0.25 – 0.505
// القيمة 0.40 داخل الفاصل بهامش ±0.15 على الجهتين.
// ⚠️ L2 على متجهات غير مُطبَّعة = عتبة هشة.
// عند تغيير نموذج embed أو زيادة الذاكرة، أعد المعايرة.
// الحل الجذري (V4): cosine عبر تطبيع المتجهات.
const MAX_DISTANCE = 0.40;

// يبني Context من الذاكرة بناءً على نص المستخدم.
// إن فشل أي شيء، يعيد Context فارغًا بدل أن يكسر الحلقة.
export async function buildMemoryContext(input: string): Promise<Context> {
  try {
    const vec = await embed(input);
    const db = getDb();
    const raw = retrieveUnified(db, vec, MEMORY_LIMIT);
    const relevant = raw.filter((r) => r.distance <= MAX_DISTANCE);
    const discarded = raw.length - relevant.length;

    const memories: MemoryItem[] = relevant.map((r) => ({
      id: r.id,
      content: r.content.slice(0, MAX_CONTENT_LEN),
      category: r.category,
      similarity: 1 - r.distance,
    }));

    log.info('Memory context built', {
      count: memories.length,
      discarded,
      total: raw.length,
    });
    return { memories };
  } catch (err) {
    log.warn('Memory retrieval failed, proceeding empty', { err });
    return { memories: [] };
  }
}

// يحفظ المحادثة في الذاكرة (المُدخل + رد الوكيل).
// فشل الحفظ لا يكسر الحلقة.
export async function saveToMemory(
  userInput: string,
  agentOutput: string,
  agentName: string | null,
): Promise<void> {
  try {
    const db = getDb();

    const userVec = await embed(userInput.slice(0, MAX_CONTENT_LEN));
    saveConversation(db, {
      role: 'user',
      content: userInput.slice(0, MAX_CONTENT_LEN),
      embedding: userVec,
    });

    const agentVec = await embed(agentOutput.slice(0, MAX_CONTENT_LEN));
    saveConversation(db, {
      role: 'agent',
      agentName: agentName ?? 'chat',
      content: agentOutput.slice(0, MAX_CONTENT_LEN),
      embedding: agentVec,
    });

    log.info('Saved to memory', { agent: agentName ?? 'chat' });
  } catch (err) {
    log.warn('Memory save failed', { err });
  }
}
