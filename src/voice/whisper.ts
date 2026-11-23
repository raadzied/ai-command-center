import { logger as log } from '../llm/logger.js';

const GEMINI_STT_MODELS: readonly string[] = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const STT_INSTRUCTION =
  'أنت نظام دقيق جداً لتحويل الصوت إلى نص. استمع للمقطع الصوتي وفرّغ الكلام المنطوق بدقة تامة باللغة العربية مع الفهم الكامل للهجة اليمنية (مثل: إيش، أشتي، شوف، كيف، مالك، تمام، خلّص، عدّل، ابسر، هيا، ذلحين) واللهجات العربية والمصطلحات التقنية الإنجليزية. أرجع النص المفرّغ فقط كما قاله المتحدث بدون أي شرح أو مقدمات أو علامات تنصيص. إذا كان المقطع صمتاً أو ضوضاء فقط بدون كلام بشري، أرجع نصاً فارغاً تماماً.';

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

interface GeminiAudioResult {
  ok: boolean;
  status: number;
  text: string;
}

function extractText(data: GeminiResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part: GeminiPart): string => part.text ?? '')
    .join(' ')
    .trim();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function callGeminiAudio(
  model: string,
  apiKey: string,
  base64Audio: string,
): Promise<GeminiAudioResult> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [
      {
        parts: [
          { text: STT_INSTRUCTION },
          { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 512 },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, status: res.status, text: '' };
    const data = (await res.json()) as GeminiResponse;
    return { ok: true, status: res.status, text: extractText(data) };
  } catch (error) {
    log.warn('Gemini STT request error', { model, error: describeError(error) });
    return { ok: false, status: 0, text: '' };
  }
}

export async function transcribeWithWhisperFlow(base64Audio: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('مفتاح GEMINI_API_KEY غير موجود في ملف .env');

  const audioBuffer = Buffer.from(base64Audio, 'base64');
  if (audioBuffer.length < 200) {
    throw new Error('التسجيل الصوتي قصير جداً أو فارغ');
  }

  let lastStatus = 0;
  for (const model of GEMINI_STT_MODELS) {
    const result = await callGeminiAudio(model, apiKey, base64Audio);
    lastStatus = result.status;
    if (result.ok) {
      const cleaned = result.text.replace(/\s+/gu, ' ').trim();
      log.info('Gemini STT succeeded', { model, chars: cleaned.length });
      return cleaned;
    }
    log.warn('Gemini STT model failed, trying next', { model, status: result.status });
  }

  throw new Error(`فشل Gemini STT بجميع النماذج (آخر حالة: ${lastStatus})`);
}
