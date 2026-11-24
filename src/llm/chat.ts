import 'dotenv/config';
import { logger as log } from './logger.js';
import { fetchWithTimeout, waitForRetry } from './request-control.js';
import { chatGroq } from './groq.js';
import { setActiveModel } from './active-model.js';

export { chatGroq };

/** رسالة سابقة تُمرَّر لبناء سياق متعدد الأدوار. */
export interface ChatHistoryMessage {
  role: 'user' | 'agent';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  preferredModel?: string;
  // افتراضي true — للتوافق مع المستدعين الحاليين (decomposer/quality-gate).
  // مرّره false للنص العادي: Groq يرفض json_object إن لم يذكر الطلب JSON.
  jsonMode?: boolean;
  // رسائل الجلسة السابقة (الأقدم أولًا) — تُضاف قبل رسالة المستخدم الحالية.
  history?: ReadonlyArray<ChatHistoryMessage>;
  /** إلغاء التشغيل الحالي، يقطع طلب المزود فورًا. */
  signal?: AbortSignal;
}

function getKey(): string {
  const v = process.env.GEMINI_API_KEY;
  if (!v) throw new Error('GEMINI_API_KEY is not set. Check your .env file.');
  return v;
}

// يقرأ Retry-After من رأس الاستجابة (بالثواني)
function parseRetryAfter(resp: Response): number | null {
  const seconds = Number(resp.headers.get('Retry-After') ?? '');
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * 1000, 30000) // cap 30s
    : null;
}

interface GeminiTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

// يحوّل السجل إلى أدوار Gemini، ويدمج الأدوار المتتالية في دور واحد.
function toGeminiContents(
  history: ReadonlyArray<ChatHistoryMessage>,
  user: string,
): GeminiTurn[] {
  const turns: GeminiTurn[] = [];
  for (const message of [...history, { role: 'user' as const, content: user }]) {
    const role = message.role === 'agent' ? 'model' : 'user';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.parts.push({ text: message.content });
    else turns.push({ role, parts: [{ text: message.content }] });
  }
  return turns;
}

export async function chat(
  system: string,
  user: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = getKey();
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGeminiContents(options.history ?? [], user),
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const maxAttemptsPerModel = 2;
  let lastStatus = 0;
  let response: Response | null = null;
  const modelList = options.model ? [options.model] : models;
  let usedModel = models[0] ?? 'gemini-2.5-flash';

  outer: for (const model of modelList) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }, 60000, options.signal);
      if (response.ok) {
        usedModel = model;
        break outer;
      }

      lastStatus = response.status;
      if (![429, 500, 502, 503, 504].includes(lastStatus)) break outer;

      if (attempt < maxAttemptsPerModel) {
        const retryAfter = parseRetryAfter(response);
        const computedDelay = 1000 * Math.pow(2, attempt - 1);
        const delayMs = Math.min(retryAfter ?? computedDelay, 30000);
        log.warn(`Gemini ${model} attempt ${attempt} failed`, { status: lastStatus, retryInMs: delayMs });
        await waitForRetry(delayMs, options.signal);
      }
    }
    log.warn(`Switching to fallback model after ${model} failed`, { status: lastStatus });
  }

  if (!response || !response.ok) {
    log.error('Gemini chat failed after all models', { status: lastStatus });
    log.warn('All Gemini models failed, falling back to Groq', { status: lastStatus });
    return chatGroq(system, user, { ...options, jsonMode: false });
  }

  const data = (await response.json()) as unknown;
  setActiveModel('Gemini', usedModel);
  return extractText(data);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function asNonEmptyArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(label);
  return value;
}

function extractText(data: unknown): string {
  const d = asRecord(data, 'Gemini chat response');
  const candidates = asNonEmptyArray(d['candidates'], 'Gemini returned no candidates');
  const first = asRecord(candidates[0], 'candidate shape');
  const content = asRecord(first['content'], 'content shape');
  const parts = asNonEmptyArray(content['parts'], 'No parts in content');
  const text = asRecord(parts[0], 'part shape')['text'];
  if (typeof text !== 'string') {
    throw new Error('Invalid text in part');
  }
  // اكشف القطع بسبب حد الرموز
  if (first['finishReason'] === 'MAX_TOKENS') {
    log.warn('Response truncated by MAX_TOKENS');
    return text + '\n\n[WARN] [الرد مقطوع — تجاوز حد الرموز]';
  }
  return text;
}
