import 'dotenv/config';
import { logger as log } from './logger.js';

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  preferredModel?: string;
  // افتراضي true — للتوافق مع المستدعين الحاليين (decomposer/quality-gate).
  // مرّره false للنص العادي: Groq يرفض json_object إن لم يذكر الطلب JSON.
  jsonMode?: boolean;
}

function getKey(): string {
  const v = process.env.GEMINI_API_KEY;
  if (!v) throw new Error('GEMINI_API_KEY is not set. Check your .env file.');
  return v;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 60000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// يقرأ Retry-After من رأس الاستجابة (بالثواني)
function parseRetryAfter(resp: Response): number | null {
  const raw = resp.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 30000); // cap 30s
  }
  return null;
}

export async function chat(
  system: string,
  user: string,
  options: ChatOptions = {},
): Promise<string> {
  const apiKey = getKey();
  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ];
  const primaryModel = options.model ?? models[0];
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 2048,
      thinkingConfig: {
        thinkingBudget: 0,
      },
    },
  };

  const maxAttemptsPerModel = 2;
  let lastStatus = 0;
  let response: Response | null = null;

  const modelList = options.model
    ? [options.model]
    : models;

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
        log.warn(`Gemini ${model} attempt ${attempt} failed`, {
          status: lastStatus,
          retryInMs: delayMs,
        });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    log.warn(`Switching to fallback model after ${model} failed`, {
      status: lastStatus,
    });
  }

  if (!response || !response.ok) {
    log.error('Gemini chat failed after all models', { status: lastStatus });
    log.warn('All Gemini models failed, falling back to Groq', {
      status: lastStatus,
    });
    return chatGroq(system, user, { ...options, jsonMode: false });
  }

  const data = (await response.json()) as unknown;
  return extractText(data);
}

function extractText(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid Gemini chat response');
  }
  const d = data as Record<string, unknown>;
  const candidates = d['candidates'];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }
  const first = candidates[0];
  if (typeof first !== 'object' || first === null) {
    throw new Error('Invalid candidate shape');
  }
  const content = (first as Record<string, unknown>)['content'];
  if (typeof content !== 'object' || content === null) {
    throw new Error('Invalid content shape');
  }
  const parts = (content as Record<string, unknown>)['parts'];
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('No parts in content');
  }
  const text = (parts[0] as Record<string, unknown>)['text'];
  if (typeof text !== 'string') {
    throw new Error('Invalid text in part');
  }

  // اكشف القطع بسبب حد الرموز
  const finishReason = (first as Record<string, unknown>)['finishReason'];
  if (finishReason === 'MAX_TOKENS') {
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
    : process.env.GROQ_CHAT_MODELS ??
      'openai/gpt-oss-20b,openai/gpt-oss-120b';
  const models = modelsRaw.split(',').map((m) => m.trim()).filter(Boolean);

  const jsonMode = options.jsonMode !== false;
  const body: Record<string, unknown> = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 500,
  };
  if (jsonMode) {
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
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
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
    continue;
  }

  throw new Error('All Groq chat models failed');
}

// يستخرج نص المحتوى من استجابة Groq (OpenAI-compatible)
function extractGroqContent(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const choices = (data as Record<string, unknown>)['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as Record<string, unknown>)['message'];
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as Record<string, unknown>)['content'];
  return typeof content === 'string' ? content : null;
}