import type Database from 'better-sqlite3';
import type { Context, RunScope } from '../types.js';
import { getDb } from '../memory/db.js';
import { embed } from '../llm/classifier.cloud.js';
import { retrieveUnified } from '../memory/retrieve.js';
import type { ConversationQueryOptions } from '../memory/retrieve.js';
import { getRecentSessionMessages } from '../memory/sessions.js';
import { saveConversation } from '../memory/store.js';
import { logger as log } from '../llm/logger.js';

// كم عنصرًا نسترجع من الذاكرة قبل كل مهمة
const MEMORY_LIMIT = 5;

// أقصى طول يُحفظ من نص واحد (لتفادي تضخم DB)
const MAX_CONTENT_LEN = 2000;

// عدد رسائل الجلسة السابقة التي تُمرَّر لمسار الدردشة
const RECENT_MESSAGES_LIMIT = 10;

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

// يحدد فلتر المحادثات حسب النطاق:
// - daily: الوضع اليومي (بلا مشروع).
// - workspace: محادثات المشروع؛ projectId = null يعني جلسات بلا مشروع (CLI).
// غياب النطاق = بحث عالمي (السلوك القديم، للاختبارات والمستدعين القدامى).
function toConversationFilter(scope?: RunScope): ConversationQueryOptions {
  if (scope === undefined) return {};
  return { projectId: scope.kind === 'daily' ? null : scope.projectId };
}

function loadRecentMessages(
  db: Database.Database,
  scope?: RunScope,
): Context['recentMessages'] {
  if (scope === undefined || scope.sessionId === null) return undefined;

  const messages = getRecentSessionMessages(
    db,
    scope.sessionId,
    RECENT_MESSAGES_LIMIT,
  );
  if (messages.length === 0) return undefined;

  return messages.map((m) => ({
    role: m.role,
    agentName: m.agentName,
    content: m.content.slice(0, MAX_CONTENT_LEN),
  }));
}

// يعيد اتصال DB أو null بدل رمي استثناء — الذاكرة خدمة اختيارية للحلقة.
function getDbOrNull(): Database.Database | null {
  try {
    return getDb();
  } catch (err) {
    log.warn('Memory DB unavailable, proceeding empty', { err });
    return null;
  }
}

// يبني Context من الذاكرة بناءً على نص المستخدم والنطاق.
// إن فشل أي جزء، يكمل بالمتاح بدل أن يكسر الحلقة.
export async function buildMemoryContext(
  input: string,
  scope?: RunScope,
): Promise<Context> {
  const db = getDbOrNull();
  if (db === null) return { memories: [] };

  const context: Context = { memories: [] };
  if (scope?.kind === 'workspace' && scope.projectId !== null) {
    context.projectId = scope.projectId;
  }

  // رسائل الجلسة تُحمَّل أولًا حتى لا تُفقد عند فشل embedding
  try {
    const recentMessages = loadRecentMessages(db, scope);
    if (recentMessages !== undefined) {
      context.recentMessages = recentMessages;
    }
  } catch (err) {
    log.warn('Recent messages load failed', { err });
  }

  try {
    const vec = await embed(input);
    const raw = retrieveUnified(
      db,
      vec,
      MEMORY_LIMIT,
      toConversationFilter(scope),
    );
    const relevant = raw.filter((r) => r.distance <= MAX_DISTANCE);
    const discarded = raw.length - relevant.length;

    context.memories = relevant.map((r) => ({
      id: r.id,
      content: r.content.slice(0, MAX_CONTENT_LEN),
      category: r.category,
      similarity: 1 - r.distance,
    }));

    log.info('Memory context built', {
      count: context.memories.length,
      discarded,
      total: raw.length,
      recent: context.recentMessages?.length ?? 0,
    });
  } catch (err) {
    log.warn('Memory retrieval failed, proceeding empty', { err });
  }

  return context;
}

// يحفظ المحادثة في الذاكرة (المُدخل + رد الوكيل) داخل جلسة النطاق إن وُجدت.
// فشل الحفظ لا يكسر الحلقة.
export async function saveToMemory(
  userInput: string,
  agentOutput: string,
  agentName: string | null,
  scope?: RunScope,
): Promise<void> {
  try {
    const db = getDb();
    const sessionId = scope?.sessionId ?? null;

    const userVec = await embed(userInput.slice(0, MAX_CONTENT_LEN));
    saveConversation(db, {
      role: 'user',
      content: userInput.slice(0, MAX_CONTENT_LEN),
      embedding: userVec,
      sessionId,
    });

    const agentVec = await embed(agentOutput.slice(0, MAX_CONTENT_LEN));
    saveConversation(db, {
      role: 'agent',
      agentName: agentName ?? 'chat',
      content: agentOutput.slice(0, MAX_CONTENT_LEN),
      embedding: agentVec,
      sessionId,
    });

    log.info('Saved to memory', { agent: agentName ?? 'chat', sessionId });
  } catch (err) {
    log.warn('Memory save failed', { err });
  }
}
