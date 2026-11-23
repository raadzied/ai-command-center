// Groq chat transport: JSON-mode fallback on 400 and key-free error diagnostics.

import { logger as log } from './logger.js';
import { fetchWithTimeout } from './request-control.js';
import type { ChatOptions } from './chat.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_ERROR_SNIPPET = 200;
const SECRET_IN_TEXT = /(?:gsk_|sk-)[A-Za-z0-9_-]{8,}/g;
const RETRYABLE = [400, 404, 408, 409, 425, 429, 500, 502, 503, 504];

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

/** Short, key-free excerpt of an error body for diagnostics. */
async function readErrorSnippet(response: Response): Promise<string> {
  try {
    const raw = await response.text();
    return raw
      .replace(SECRET_IN_TEXT, '[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_ERROR_SNIPPET);
  } catch (err) {
    log.warn('Groq error body unreadable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
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
  const baseBody: Record<string, unknown> = {
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: user }],
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 500,
  };
  const wantsJson = options.jsonMode !== false;

  const send = async (model: string, jsonMode: boolean): Promise<Response> => {
    const body: Record<string, unknown> = { ...baseBody, model };
    if (jsonMode) body.response_format = { type: 'json_object' };
    return await fetchWithTimeout(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 60000, options.signal);
  };

  for (const model of models) {
    let jsonMode = wantsJson;
    let response = await send(model, jsonMode);
    // gpt-oss may reject json_object with 400/json_validate_failed — retry as plain text once.
    if (!response.ok && response.status === 400) {
      const snippet = await readErrorSnippet(response);
      log.warn('Groq rejected the request', { model, status: 400, jsonMode, snippet });
      if (jsonMode) {
        jsonMode = false;
        response = await send(model, false);
        if (!response.ok && response.status === 400) {
          log.warn('Groq rejected the retry without json_object', {
            model, status: 400, snippet: await readErrorSnippet(response),
          });
        }
      }
    }

    if (!response.ok) {
      log.warn('Groq chat model failed', { model, status: response.status });
      if (!RETRYABLE.includes(response.status)) break;
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
