import { getVoiceForAgent } from './voices.js';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { logger as log } from '../llm/logger.js';

const HAKIM_URL = 'https://api.tryhakim.ai/v1/audio/speech';

let currentChild: ChildProcess | null = null;
let playbackCancelled = false;
let currentAbort: AbortController | null = null;

export interface SpeakOptions {
  agentName?: string | null;
}

// بث الصوت إلى Electron من خلال IPC
export type AudioEmitCallback = (payload: { base64Mp3: string; agentName: string | null }) => void;
let electronAudioEmitter: AudioEmitCallback | null = null;
export function setElectronAudioEmitter(cb: AudioEmitCallback | null): void {
  electronAudioEmitter = cb;
}

// جلب صوت Google TTS المجاني (بدون مفتاح API)
async function fetchFreeArabicMp3(text: string, signal: AbortSignal): Promise<Buffer | null> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!clean) return null;
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(clean)}`;
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function playMp3File(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const escaped = filePath.replace(/'/g, "''");
    const psCmd = `
      Add-Type -AssemblyName presentationCore;
      $player = New-Object System.Windows.Media.MediaPlayer;
      $player.Open([Uri]::new('${escaped}'));
      $player.Play();
      $waited = 0;
      while (-not $player.NaturalDuration.HasTimeSpan -and $waited -lt 50) {
        Start-Sleep -Milliseconds 100;
        $waited++;
      }
      while ($player.NaturalDuration.HasTimeSpan -and $player.Position -lt $player.NaturalDuration.TimeSpan) {
        Start-Sleep -Milliseconds 200;
      }
      $player.Close();
    `;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      stdio: 'ignore',
      windowsHide: true,
    });
    currentChild = child;
    child.on('close', () => {
      if (currentChild === child) currentChild = null;
      resolve();
    });
    child.on('error', () => {
      if (currentChild === child) currentChild = null;
      resolve();
    });
  });
}

function speakLocalFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    const clean = text.replace(/['"`$]/g, ' ').slice(0, 500);
    const psCmd = `
      Add-Type -AssemblyName System.Speech;
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $arVoice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ar-*' } | Select-Object -First 1;
      if ($arVoice) { $synth.SelectVoice($arVoice.VoiceInfo.Name); }
      $synth.Speak('${clean}');
    `;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      stdio: 'ignore',
      windowsHide: true,
    });
    currentChild = child;
    child.on('close', () => {
      if (currentChild === child) currentChild = null;
      resolve();
    });
    child.on('error', () => {
      if (currentChild === child) currentChild = null;
      resolve();
    });
  });
}

export async function speak(
  text: string,
  options: SpeakOptions = {},
): Promise<void> {
  if (!text.trim()) return;
  playbackCancelled = false;
  const { agentName } = options;

  const apiKey = process.env.HAKIM_API_KEY;
  let mp3Buffer: Buffer | null = null;

  try {
    if (apiKey) {
      // --- Hakim AI ---
      const voice = getVoiceForAgent(agentName ?? null);
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tmpPath = join(tmpdir(), `ai-cc-${stamp}.mp3`);
      const abort = new AbortController();

      currentAbort = abort;
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
        signal: abort.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        log.warn('Hakim TTS error — using local fallback', { status: res.status, err: errText.slice(0, 200) });
        throw new Error('HAKIM_FAILED');
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 1000) {
        log.warn('Small audio buffer — using local fallback', { bytes: buffer.length });
        throw new Error('BUFFER_TOO_SMALL');
      }

      mp3Buffer = buffer;
    } else {
      // --- بدون مفتاح API → Google TTS المجاني ---
      mp3Buffer = await fetchFreeArabicMp3(text, AbortSignal.timeout(8000));
    }

    // ---- مسار الصوت إلى Electron ----
    if (mp3Buffer && electronAudioEmitter) {
      // إرسال payload عبر IPC إلى renderer
      electronAudioEmitter({ base64Mp3: mp3Buffer.toString('base64'), agentName: agentName ?? null });
      // تقريبية للنطق
      const approxMs = Math.min(8000, Math.max(2000, text.length * 65));
      await new Promise<void>((r) => setTimeout(() => r(), approxMs));
      return;
    }

    // ---- Electron غير موجود → تشغيل محلي باستخدام PowerShell ----
    if (mp3Buffer && !electronAudioEmitter) {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const tmpPath = join(tmpdir(), `ai-cc-${stamp}.mp3`);
      await writeFile(tmpPath, mp3Buffer);
      if (playbackCancelled) {
        log.info('Playback skipped - cancelled before start');
        return;
      }
      await playMp3File(tmpPath);
    }
  } catch (err) {
    if (err instanceof Error && (err.message === 'HAKIM_FAILED' || err.message === 'BUFFER_TOO_SMALL')) {
      log.info('Fallback to local TTS due to Hakim issue');
      await speakLocalFallback(text);
      return;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      log.info('TTS aborted by user');
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('TTS request failed — using local fallback', { message: msg });
    await speakLocalFallback(text);
  } finally {
    if (currentAbort) currentAbort.abort();
    currentAbort = null;
  }
}

export function killCurrentPlayback(): void {
  playbackCancelled = true;
  currentAbort?.abort();
  if (currentChild) {
    try {
      currentChild.kill();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn('Kill playback failed', { message: msg });
    }
    currentChild = null;
  }
}

export async function listVoices(): Promise<string[]> {
  return ['reem-khaleeji'];
}
