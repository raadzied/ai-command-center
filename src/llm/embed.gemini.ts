import { fetchWithTimeout } from './request-control.js';
import { logger as log } from './logger.js';

// يتحقق أن القيمة كائن مسطح
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// يقرأ مفتاح API أو يفشل فورًا
function getKey(name: 'GEMINI_API_KEY'): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Check your .env file.`);
  }
  return v;
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
