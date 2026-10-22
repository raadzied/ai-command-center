import { logger as log } from '../llm/logger.js';
import { speak, killCurrentPlayback } from './tts.js';
import { extractEssence } from './essence.js';

let voiceEnabled = false;
let cancelled = false;
let speechChain: Promise<void> = Promise.resolve();

export function isVoiceEnabled(): boolean {
  return voiceEnabled;
}

export function setVoiceEnabled(value: boolean): void {
  voiceEnabled = value;
}

export function toggleVoice(): boolean {
  voiceEnabled = !voiceEnabled;
  return voiceEnabled;
}

export function cancelSpeech(): void {
  cancelled = true;
  killCurrentPlayback();
  log.info('Speech cancelled + current playback killed');
}

// يضع جوهر الرد في طابور النطق — fire-and-forget.
export function enqueueSpeech(text: string, agentName: string | null): void {
  if (!voiceEnabled || cancelled) return;
  if (!text.trim()) return;

  const essence = extractEssence(text);

  if (!essence) {
    log.info('Speech skipped — no essence to speak');
    return;
  }

  speechChain = speechChain
    .then(() => {
      if (cancelled) return;
      return speak(essence, { agentName });
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Speech queue error', { message: msg });
    });
}

// ينتظر انتهاء الطابور (اختياري، للاختبارات)
export async function waitForSpeechQueue(): Promise<void> {
  await speechChain;
}
