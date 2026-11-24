// Microsoft Edge Neural TTS — natural Arabic voices, used after Hakim AI.

import { EdgeTTS } from 'node-edge-tts';
import { logger as log } from '../llm/logger.js';

const DEFAULT_VOICE = 'ar-YE-SalehNeural';

const AGENT_VOICES: Readonly<Record<string, string>> = {
  core: DEFAULT_VOICE,
  chat: DEFAULT_VOICE,
  orchestrator: DEFAULT_VOICE,
  mentor: DEFAULT_VOICE,
  coder: 'ar-SA-HamedNeural',
  designer: 'ar-SA-ZariyahNeural',
  advisor: 'ar-YE-MaryamNeural',
  commander: 'ar-EG-ShakirNeural',
};

/** Resolves an agent name to its natural Edge neural voice. */
export function edgeVoiceForAgent(agent?: string): string {
  if (!agent || agent.trim() === '') return DEFAULT_VOICE;
  return AGENT_VOICES[agent.trim().toLowerCase()] ?? DEFAULT_VOICE;
}

/** Derives the locale (e.g. ar-YE) from a voice name (e.g. ar-YE-SalehNeural). */
export function voiceLang(voice: string): string {
  return voice.split('-').slice(0, 2).join('-');
}

interface EdgeSubtitle {
  part: string;
  start: number;
  end: number;
}

export type EdgeChunk = Buffer | EdgeSubtitle;

export interface EdgeTtsDeps {
  readonly stream?: (voice: string, lang: string, text: string) => AsyncGenerator<EdgeChunk>;
  readonly warn?: (message: string, meta: Record<string, unknown>) => void;
}

function openStream(voice: string, lang: string, text: string): AsyncGenerator<EdgeChunk> {
  const tts = new EdgeTTS({ voice, lang, timeout: 12_000 });
  return tts.streamAudio(text);
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.trim() || error.name || 'Error';
  if (typeof error === 'string') return error.trim() || 'unknown string error';
  if (typeof error === 'object' && error !== null) {
    const record = error as { message?: unknown; error?: unknown; code?: unknown };
    for (const value of [record.message, record.error, record.code]) {
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
    try {
      const json = JSON.stringify(error);
      if (json !== undefined && json !== '{}') return json.slice(0, 250);
    } catch (err) {
      log.debug('Edge TTS error could not be serialized', { message: String(err) });
    }
  }
  const text = String(error).trim();
  return text === '' || text === '[object Object]' ? 'unknown error' : text;
}

/**
 * Streams Edge TTS into an in-memory MP3 buffer.
 * Returns null on empty output, cancellation, or any network/protocol error.
 */
export async function synthesizeEdgeTts(
  text: string,
  agent?: string,
  signal?: AbortSignal,
  deps?: EdgeTtsDeps,
): Promise<Buffer | null> {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return null;
  const voice = edgeVoiceForAgent(agent);
  const warn = deps?.warn ?? log.warn;
  let cancelled = signal?.aborted === true;
  const onAbort = (): void => { cancelled = true; };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (cancelled) {
      warn('Edge TTS cancelled', { voice, reason: 'aborted' });
      return null;
    }
    const parts: Buffer[] = [];
    const stream = (deps?.stream ?? openStream)(voice, voiceLang(voice), clean);
    for await (const chunk of stream) {
      if (cancelled) break;
      if (Buffer.isBuffer(chunk) && chunk.length > 0) parts.push(chunk);
    }
    if (cancelled || signal?.aborted === true) {
      warn('Edge TTS cancelled', { voice, reason: 'aborted' });
      return null;
    }
    const mp3 = Buffer.concat(parts);
    if (mp3.length === 0) {
      warn('Edge TTS returned no audio', { voice });
      return null;
    }
    log.info('Edge Neural TTS succeeded', { voice, bytes: mp3.length });
    return mp3;
  } catch (err) {
    warn('Edge TTS failed', { voice, message: describe(err) });
    return null;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
