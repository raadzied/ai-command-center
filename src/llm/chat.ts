import 'dotenv/config';
import { logger as log } from './logger.js';

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
}

function getKey(): string {
  const v = process.env.GEMINI_API_KEY;
  if (!v) throw new Error('GEMINI_API_KEY is not set. Check your .env file.');
  return v;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 60000): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
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

  outer: for (const model of modelList) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) break outer;

      lastStatus = response.status;
      if (![429, 500, 502, 503, 504].includes(lastStatus)) break outer;

      if (attempt < maxAttemptsPerModel) {
        const retryAfter = parseRetryAfter(response);
        const computedDelay = 1000 * Math.pow(2, attempt - 1);
        const delayMs = Math.min(retryAfter ?? computedDelay, 30000);
        log.warn(`Gemini ${model} attempt ${attempt} failed`, { status: lastStatus, retryInMs: delayMs });
        await new Promise((r) => setTimeout(r, delayMs));
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
    return text + '\n\n⚠️ [الرد مقطوع — تجاوز حد الرموز]';
  }
  return text;
}

// بديل Groq لدردشة عامة — يُستخدم للمهام التحليلية البسيطة
export async function chatGroq(
  system: string,
  user: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set');
  }

  const modelsRaw = options.preferredModel
    ? options.preferredModel
    : process.env.GROQ_CHAT_MODELS ?? 'openai/gpt-oss-20b,openai/gpt-oss-120b';
  const models = modelsRaw.split(',').map((m) => m.trim()).filter(Boolean);

  const history = (options.history ?? []).map((m) => ({
    role: m.role === 'agent' ? 'assistant' : 'user', content: m.content,
  }));
  const body: Record<string, unknown> = {
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: user }],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 500,
  };
  if (options.jsonMode !== false) {
    body.response_format = { type: 'json_object' };
  }

  // Groq يُرجع 400 أحيانًا عند rate limiting على مستوى الـ burst،
  // لذا نعتبره قابلًا لإعادة المحاولة مع الموديل التالي.
  const retryable = [400, 404, 408, 409, 425, 429, 500, 502, 503, 504];

  for (const model of models) {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model }),
      },
    );

    if (!response.ok) {
      log.warn('Groq chat model failed', { model, status: response.status });
      if (!retryable.includes(response.status)) break;
      continue;
    }

    const data = (await response.json()) as unknown;
    const text = extractGroqContent(data);
    if (text !== null) {
      log.info('Groq chat succeeded', { model });
      return text;
    }
  }

  throw new Error('All Groq chat models failed');
}

function pickRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

// يستخرج نص المحتوى من استجابة Groq (OpenAI-compatible)
function extractGroqContent(data: unknown): string | null {
  const choices = pickRecord(data)?.['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = pickRecord(pickRecord(choices[0])?.['message']);
  const content = message?.['content'];
  return typeof content === 'string' ? content : null;
}
