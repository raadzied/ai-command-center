import { logger as log } from '../llm/logger.js';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

interface GroqTranscriptionResponse {
  text?: string;
}

function cleanFillerWords(raw: string): string {
  return raw
    .replace(/\b(اممم+|اههه+|يعني\s+يعني|آآ+)\b/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export async function transcribeWithWhisperFlow(base64Audio: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GROQ_API_KEY غير موجود في ملف .env');
  }

  const audioBuffer = Buffer.from(base64Audio, 'base64');
  if (audioBuffer.length < 200) {
    throw new Error('التسجيل الصوتي قصير جداً أو فارغ');
  }

  const blob = new Blob([audioBuffer], { type: 'audio/webm' });
  const form = new FormData();
  form.append('file', blob, 'speech.webm');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'json');
  form.append('temperature', '0');

  log.info('إرسال الصوت إلى Groq Whisper Flow', { bytes: audioBuffer.length });

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`, // إزالة Content-Type لأن FormData بإضافته
    },
    body: form,
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل Whisper API (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as GroqTranscriptionResponse;
  const cleaned = cleanFillerWords(data.text ?? '');
  log.info('تم التحويل بواسطة Whisper', { chars: cleaned.length });
  return cleaned;
}
