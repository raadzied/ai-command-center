import { getVoiceForAgent } from './voices.js';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { logger as log } from '../llm/logger.js';

const HAKIM_URL = 'https://api.tryhakim.ai/v1/audio/speech';
const PS_PLAY = resolve(process.cwd(), 'scripts/play-mp3.ps1');

export interface SpeakOptions {
  agentName?: string | null;
}

export async function speak(
  text: string,
  options: SpeakOptions = {},
): Promise<void> {
  if (!text.trim()) return;

  const apiKey = process.env.HAKIM_API_KEY;
  if (!apiKey) {
    log.warn('TTS skipped — HAKIM_API_KEY not set');
    return;
  }

  const voice = getVoiceForAgent(options.agentName ?? null);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const tmpPath = join(tmpdir(), `ai-cc-${stamp}.mp3`);

  try {
    log.info('TTS synthesizing via Hakim', {
      agent: options.agentName ?? 'default',
      voice,
      length: text.length,
    });

    const res = await fetch(HAKIM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'hakim-fast-v1',
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Hakim ${res.status}: ${errText.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) {
      throw new Error(`Suspiciously small audio: ${buffer.length} bytes`);
    }

    await writeFile(tmpPath, buffer);
    await playMp3(tmpPath);
    log.info('TTS completed', { bytes: buffer.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('TTS failed', { message: msg });
  } finally {
    try {
      await unlink(tmpPath);
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') {
        log.warn('TTS cleanup failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

function playMp3(path: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_PLAY, '-Path', path],
      { stdio: 'ignore' },
    );
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`PS exit ${code}`));
    });
  });
}

export async function listVoices(): Promise<string[]> {
  return ['reem-khaleeji'];
}
