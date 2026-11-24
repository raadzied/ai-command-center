// STEP 81-FIX — Edge Neural TTS unit tests (offline, dependency injected).

import { readFileSync } from 'node:fs';
import { edgeVoiceForAgent, synthesizeEdgeTts, voiceLang } from '../src/voice/edge-tts.js';
import type { EdgeChunk } from '../src/voice/edge-tts.js';
import {
  getHakimCooldownRemainingMs,
  noteHakimQuotaExceeded,
  resetHakimCooldown,
  ttsProviderOrder,
} from '../src/voice/tts.js';
import { check, finish } from './test-db-helpers.js';

interface Warning {
  readonly message: string;
  readonly meta: Record<string, unknown>;
}

const DEFAULT_VOICE = 'ar-YE-SalehNeural';
const EXPECTED_VOICES: Readonly<Record<string, string>> = {
  core: DEFAULT_VOICE,
  chat: DEFAULT_VOICE,
  orchestrator: DEFAULT_VOICE,
  mentor: DEFAULT_VOICE,
  coder: 'ar-SA-HamedNeural',
  designer: 'ar-SA-ZariyahNeural',
  advisor: 'ar-YE-MaryamNeural',
  commander: 'ar-EG-ShakirNeural',
};

const EXPECTED_LANGS: Readonly<Record<string, string>> = {
  core: 'ar-YE', chat: 'ar-YE', orchestrator: 'ar-YE', mentor: 'ar-YE',
  coder: 'ar-SA', designer: 'ar-SA', advisor: 'ar-YE', commander: 'ar-EG',
};

async function* fakeStream(chunks: readonly EdgeChunk[]): AsyncGenerator<EdgeChunk> {
  for (const chunk of chunks) yield chunk;
}

async function* failingStream(): AsyncGenerator<EdgeChunk> {
  yield Buffer.from('ID3');
  throw new Error('network dropped');
}

async function* throwingJsonStream(): AsyncGenerator<EdgeChunk> {
  throw { status: 503, message: 'service unavailable' };
}

async function main(): Promise<void> {
  console.log('=== STEP 81-FIX — Edge Neural TTS Test ===\n');

  for (const [agent, voice] of Object.entries(EXPECTED_VOICES)) {
    check(`${agent} maps to ${voice}`, edgeVoiceForAgent(agent) === voice);
  }
  check('unknown and empty agents use the Saleh default',
    edgeVoiceForAgent('unknown') === DEFAULT_VOICE && edgeVoiceForAgent() === DEFAULT_VOICE);
  check('agent matching is case-insensitive', edgeVoiceForAgent('  CODER ') === 'ar-SA-HamedNeural');

  const warnings: Warning[] = [];
  const seenVoices: string[] = [];
  const seenTexts: string[] = [];
  const warn = (message: string, meta: Record<string, unknown>): void => {
    warnings.push({ message, meta });
  };
  const mp3 = await synthesizeEdgeTts('  مرحبا   بالعالم  ', 'coder', undefined, {
    stream: (voice: string, _lang: string, text: string): AsyncGenerator<EdgeChunk> => {
      seenVoices.push(voice);
      seenTexts.push(text);
      return fakeStream([
        Buffer.from('ID3'),
        { part: 'مرحبا', start: 0, end: 100 },
        Buffer.from([0xff, 0xfb, 0x90, 0x00]),
      ]);
    },
    warn,
  });
  check('MP3 chunks are concatenated and subtitles skipped',
    mp3 !== null && mp3.equals(Buffer.concat([Buffer.from('ID3'), Buffer.from([0xff, 0xfb, 0x90, 0x00])])));
  check('the agent voice and normalized text reach the stream',
    seenVoices[0] === 'ar-SA-HamedNeural' && seenTexts[0] === 'مرحبا بالعالم');
  check('success emits no warnings', warnings.length === 0);

  const seenLocales: Array<{ voice: string; lang: string }> = [];
  for (const agent of Object.keys(EXPECTED_VOICES)) {
    await synthesizeEdgeTts('نص', agent, undefined, {
      stream: (usedVoice: string, lang: string): AsyncGenerator<EdgeChunk> => {
        seenLocales.push({ voice: usedVoice, lang });
        return fakeStream([Buffer.from('ID3')]);
      },
      warn,
    });
  }
  check('voiceLang derives the first two locale segments', voiceLang('ar-YE-SalehNeural') === 'ar-YE');
  check('each agent voice receives its matching lang',
    Object.keys(EXPECTED_VOICES).every((agent: string, index: number): boolean => {
      const seen = seenLocales[index];
      return seen !== undefined && seen.voice === EXPECTED_VOICES[agent]
        && seen.lang === EXPECTED_LANGS[agent];
    }));

  const failed = await synthesizeEdgeTts('فشل', 'designer', undefined, {
    stream: failingStream,
    warn,
  });
  check('network failure returns null', failed === null);
  check('network failure is logged with the chosen voice',
    warnings.some((w: Warning): boolean => w.message === 'Edge TTS failed'
      && w.meta['voice'] === 'ar-SA-ZariyahNeural'));

  const jsonWarnings: Warning[] = [];
  const jsonFailed = await synthesizeEdgeTts('خطأ', undefined, undefined, {
    stream: throwingJsonStream,
    warn: (message: string, meta: Record<string, unknown>): void => {
      jsonWarnings.push({ message, meta });
    },
  });
  const jsonWarn = jsonWarnings.find((w: Warning): boolean => w.message === 'Edge TTS failed');
  check('non-Error throw returns null with a serialized message',
    jsonFailed === null && jsonWarn !== undefined
    && typeof jsonWarn.meta['message'] === 'string'
    && String(jsonWarn.meta['message']).includes('service unavailable'));

  const empty = await synthesizeEdgeTts('صمت', undefined, undefined, {
    stream: (): AsyncGenerator<EdgeChunk> => fakeStream([{ part: 'x', start: 0, end: 1 }]),
    warn,
  });
  check('subtitle-only output returns null', empty === null);
  check('empty input returns null without touching the stream',
    (await synthesizeEdgeTts('   ', undefined, undefined, {
      stream: (): AsyncGenerator<EdgeChunk> => { throw new Error('must not stream'); },
      warn,
    })) === null);

  const preAborted = new AbortController();
  preAborted.abort();
  check('a pre-aborted signal returns null',
    (await synthesizeEdgeTts('إلغاء', undefined, preAborted.signal, { warn })) === null);

  const midAbort = new AbortController();
  const cancelled = await synthesizeEdgeTts('إلغاء أثناء البث', 'commander', midAbort.signal, {
    stream: (): AsyncGenerator<EdgeChunk> => (async function* (): AsyncGenerator<EdgeChunk> {
      yield Buffer.from('ID3');
      midAbort.abort();
      yield Buffer.from('extra');
    })(),
    warn,
  });
  check('abort mid-stream returns null and discards audio', cancelled === null);
  check('cancellation is logged',
    warnings.some((w: Warning): boolean => w.message === 'Edge TTS cancelled'));

  resetHakimCooldown();
  const normal = ttsProviderOrder(false);
  check('normal chain is Hakim -> Edge -> Google -> SAPI',
    normal.join(',') === 'hakim,edge,google,sapi');
  noteHakimQuotaExceeded(1000);
  check('402 starts a 30-minute cooldown', getHakimCooldownRemainingMs(1000) === 30 * 60 * 1000);
  const cooled = ttsProviderOrder(getHakimCooldownRemainingMs(1000) > 0);
  check('cooldown skips Hakim and starts at Edge', cooled.join(',') === 'edge,google,sapi');
  check('cooldown expires after 30 minutes', getHakimCooldownRemainingMs(1000 + 30 * 60 * 1000 + 1) === 0);
  resetHakimCooldown();

  const edgeSource = readFileSync('src/voice/edge-tts.ts', 'utf8');
  check('EdgeTTS receives voice, lang and timeout only (default outputFormat)',
    edgeSource.includes('new EdgeTTS({ voice, lang, timeout: 12_000 })')
    && !edgeSource.includes('outputFormat:'));

  const ttsSource = readFileSync('src/voice/tts.ts', 'utf8');
  check('tts.ts detects 402 and quota_exceeded',
    ttsSource.includes('res.status === 402') && ttsSource.includes('quota_exceeded'));
  check('tts.ts invokes Edge before Google fallback',
    ttsSource.indexOf('synthesizeEdgeTts(') < ttsSource.indexOf('fetchFreeArabicMp3(text, AbortSignal.any'));

  finish();
}

main().catch((err: unknown): void => {
  console.error('Edge TTS test failed:', err);
  process.exitCode = 1;
});
