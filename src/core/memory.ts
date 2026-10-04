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

// يبني Context من الذاكرة بناءً على نص المستخدم.
// إن فشل أي شيء، يعيد Context فارغًا بدل أن يكسر الحلقة.
export async function buildMemoryContext(input: string): Promise<Context> {
  try {
    const vec = await embed(input);
    const db = getDb();
    const raw = retrieveUnified(db, vec, MEMORY_LIMIT);

    const memories: MemoryItem[] = raw.map((r) => ({
      id: r.id,
      content: r.content.slice(0, MAX_CONTENT_LEN),
      category: r.category,
      similarity: 1 - r.distance,
    }));

    log.info('Memory context built', { count: memories.length });
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
