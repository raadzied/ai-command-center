import 'dotenv/config';
import { z } from 'zod';
import { logger } from './logger.js';
import type { LLMProvider, ClassificationResult, Intent } from '../types.js';

const log = logger;

const GroqResponseSchema = z.object({
  intent: z.enum(['learn', 'build', 'design', 'chat']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(300),
});
type GroqResponse = z.infer<typeof GroqResponseSchema>;

// النية الاحتياطية عند فشل التصنيف
const FALLBACK_INTENT: Intent = 'chat';

// يبني نتيجة احتياطية آمنة
function fallbackResult(reasoning: string): ClassificationResult {
  return { intent: FALLBACK_INTENT, confidence: 0, reasoning };
}

// يقرأ مفتاح API أو يفشل فورًا
function getKey(name: 'GROQ_API_KEY' | 'GEMINI_API_KEY'): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Check your .env file.`);
  }
  return v;
}

// fetch مع مهلة زمنية
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

const CLASSIFY_SYSTEM_PROMPT = `You are an intent classifier for an AI agent system. Classify the user message into EXACTLY ONE of these intents:
- "learn": user wants explanation, tutorial, or to understand
- "build": user wants code, files, or technical artifact
- "design": user wants UI/UX/visual/system design
- "chat": greetings, general talk, or unclear requests

Return ONLY valid JSON with this exact shape:
{"intent":"learn|build|design|chat","confidence":0.0-1.0,"reasoning":"one short English sentence"}`;

// يتحقق أن القيمة كائن مسطح
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// يستخرج نص المحتوى من استجابة Groq بأمان
function extractContent(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const choices: unknown = data['choices'];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first: unknown = choices[0];
  if (!isRecord(first)) return null;
  const message: unknown = first['message'];
  if (!isRecord(message)) return null;
  const content: unknown = message['content'];
  return typeof content === 'string' ? content : null;
}

// يقرأ قائمة موديلات التصنيف من البيئة
function getClassifierModels(): string[] {
  const raw = process.env.GROQ_CLASSIFIER_MODELS ?? 'openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.8-27b';
  return raw.split(',').map((m) => m.trim()).filter((m) => m.length > 0);
}

// يرسل طلب تصنيف واحد إلى Groq ويتحقق من الاستجابة
async function requestClassification(
  apiKey: string,
  input: string,
  isRetry: boolean,
): Promise<GroqResponse | null> {
  const userContent = isRetry ? `${input}\nReturn valid JSON only. No other text.` : input;

  const models = getClassifierModels();
  const retryableStatuses = [400, 404, 408, 409, 425, 429, 500, 502, 503, 504];

  for (const model of models) {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 200,
        }),
      },
    );

    if (!response.ok) {
      log.warn('Groq model failed', { model, status: response.status });

      // Error non-retryable → stop trying other models
      if (!retryableStatuses.includes(response.status)) return null;

      // Try the next model
      continue;
    }

    const data: unknown = (await response.json()) as unknown;
    const text = extractContent(data);
    if (text === null) continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text) as unknown;
    } catch {
      continue;
    }

    const validated = GroqResponseSchema.safeParse(parsedJson);
    if (!validated.success) continue;

    log.info('Groq classification succeeded', { model });
    return validated.data;
  }

  log.warn('All Groq classifier models failed');
  return null;
}

// يصنف نية المستخدم عبر Groq مع fallback آمن
export async function classify(input: string): Promise<ClassificationResult> {
  const apiKey = getKey('GROQ_API_KEY');
  try {
    const first = await requestClassification(apiKey, input, false);
    if (first) return first;
    logger.warn('Retrying classification once');
    const second = await requestClassification(apiKey, input, true);
    return second ?? fallbackResult('classification failed after retry');
  } catch (err) {
    log.warn('Classification request failed, using fallback', { err });
    return fallbackResult('classification failed');
  }
}

// يتحقق من شكل متجه التضمين ويعيده
function extractEmbedding(data: unknown): number[] {
  if (!isRecord(data)) throw new Error('Invalid Gemini embed response');
  const embedding: unknown = data['embedding'];
  if (!isRecord(embedding)) throw new Error('Invalid Gemini embed response');
  const values: unknown = embedding['values'];
  if (!Array.isArray(values) || values.length !== 768) {
    throw new Error('Invalid Gemini embedding vector: expected 768 numbers');
  }
  if (!values.every((v) => typeof v === 'number')) {
    throw new Error('Invalid Gemini embedding vector: expected numbers only');
  }
  return values as number[];
}

// يولد متجه تضمين عبر Gemini مع retry و backoff
export async function embed(text: string): Promise<number[]> {
  const apiKey = getKey('GEMINI_API_KEY');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;

  const maxAttempts = 3;
  const retryable = [429, 500, 502, 503, 504];
  let lastStatus = 0;
  let lastBody: string = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 }),
    });

    if (response.ok) {
      const data: unknown = (await response.json()) as unknown;
      return extractEmbedding(data);
    }

    lastStatus = response.status;
    try {
      lastBody = await response.text();
    } catch {
      lastBody = '';
    }

    if (!retryable.includes(lastStatus)) break;

    if (attempt < maxAttempts) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      log.warn('Gemini embed retry', { status: lastStatus, attempt, delayMs });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  log.error('Gemini embed failed after retries', {
    status: lastStatus,
    bodySnippet: lastBody.slice(0, 200),
  });
  throw new Error(`Gemini embed failed with status ${lastStatus}`);
}

export const cloudProvider: LLMProvider = {
  classify,
  embed,
};
