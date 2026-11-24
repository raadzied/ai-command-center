import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { logger as log } from '../llm/logger.js';
import { synthesizeEdgeTts } from './edge-tts.js';
import { getVoiceForAgent } from './voices.js';

const HAKIM_URL = 'https://api.tryhakim.ai/v1/audio/speech';
const HAKIM_COOLDOWN_MS = 30 * 60 * 1000;

let currentChild: ChildProcess | null = null;
let playbackCancelled = false;
let currentAbort: AbortController | null = null;
let hakimCooldownUntil = 0;

export interface SpeakOptions {
  agentName?: string | null;
}

export type TtsProvider = 'hakim' | 'edge' | 'google' | 'sapi';

/** Hakim is dropped for 30 minutes after a quota error. */
export function ttsProviderOrder(quietHakim: boolean): readonly TtsProvider[] {
  return quietHakim ? ['edge', 'google', 'sapi'] : ['hakim', 'edge', 'google', 'sapi'];
}

export function noteHakimQuotaExceeded(now: number = Date.now()): void {
  hakimCooldownUntil = now + HAKIM_COOLDOWN_MS;
}

export function getHakimCooldownRemainingMs(now: number = Date.now()): number {
  return Math.max(0, hakimCooldownUntil - now);
}

export function resetHakimCooldown(): void {
  hakimCooldownUntil = 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type AudioEmitCallback = (payload: { base64Mp3: string; agentName: string | null }) => void;
let electronAudioEmitter: AudioEmitCallback | null = null;
export function setElectronAudioEmitter(cb: AudioEmitCallback | null): void {
  electronAudioEmitter = cb;
}

async function fetchFreeArabicMp3(text: string, signal: AbortSignal): Promise<Buffer | null> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!clean) return null;
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(clean)}`;
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) {
    log.warn('Google TTS failed', { status: res.status });
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

function runPowerShell(psCmd: string): Promise<void> {
  return new Promise<void>((resolve): void => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd], {
      stdio: 'ignore', windowsHide: true,
    });
    currentChild = child;
    const done = (): void => { if (currentChild === child) currentChild = null; resolve(); };
    child.on('close', done);
    child.on('error', done);
  });
}

function playMp3File(filePath: string): Promise<void> {
  const escaped = filePath.replace(/'/g, "''");
  return runPowerShell(`
    Add-Type -AssemblyName presentationCore;
    $player = New-Object System.Windows.Media.MediaPlayer;
    $player.Open([Uri]::new('${escaped}'));
    $player.Play();
    $waited = 0;
    while (-not $player.NaturalDuration.HasTimeSpan -and $waited -lt 50) {
      Start-Sleep -Milliseconds 100; $waited++;
    }
    while ($player.NaturalDuration.HasTimeSpan -and $player.Position -lt $player.NaturalDuration.TimeSpan) {
      Start-Sleep -Milliseconds 200;
    }
    $player.Close();
  `);
}

function speakLocalFallback(text: string): Promise<void> {
  const clean = text.replace(/['"`$]/g, ' ').slice(0, 500);
  return runPowerShell(`
    Add-Type -AssemblyName System.Speech;
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    $arVoice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ar-*' } | Select-Object -First 1;
    if ($arVoice) { $synth.SelectVoice($arVoice.VoiceInfo.Name); }
    $synth.Speak('${clean}');
  `);
}

interface HakimResult {
  readonly buffer: Buffer | null;
  readonly quotaExceeded: boolean;
}

async function fetchHakimMp3(text: string, voice: string, signal: AbortSignal): Promise<HakimResult> {
  const res = await fetch(HAKIM_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.HAKIM_API_KEY ?? ''}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'hakim-fast-v1', voice, input: text, response_format: 'mp3' }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 402 || errText.includes('quota_exceeded')) {
      noteHakimQuotaExceeded();
      log.warn('Hakim TTS quota exceeded — using Edge for 30 minutes', { status: res.status });
      return { buffer: null, quotaExceeded: true };
    }
    log.warn('Hakim TTS error', { status: res.status, err: errText.slice(0, 200) });
    return { buffer: null, quotaExceeded: false };
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    log.warn('Hakim returned a small audio buffer', { bytes: buffer.length });
    return { buffer: null, quotaExceeded: false };
  }
  return { buffer, quotaExceeded: false };
}

async function acquireMp3(text: string, agentName: string | null, signal: AbortSignal): Promise<Buffer | null> {
  const order = ttsProviderOrder(getHakimCooldownRemainingMs() > 0);
  if (order.includes('hakim') && process.env.HAKIM_API_KEY) {
    try {
      const hakim = await fetchHakimMp3(text, getVoiceForAgent(agentName), signal);
      if (hakim.buffer) return hakim.buffer;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err;
      log.warn('Hakim TTS request failed', { message: messageOf(err) });
    }
  }
  if (order.includes('edge')) {
    const edge = await synthesizeEdgeTts(text, agentName ?? undefined, signal);
    if (edge && edge.length > 0) {
      log.info('TTS via Edge Neural', { bytes: edge.length, agent: agentName ?? 'core' });
      return edge;
    }
  }
  return order.includes('google') ? fetchFreeArabicMp3(text, AbortSignal.any([signal, AbortSignal.timeout(8000)])) : null;
}

export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!text.trim()) return;
  playbackCancelled = false;
  const { agentName } = options;
  const abort = new AbortController();
  currentAbort = abort;
  try {
    const mp3Buffer = await acquireMp3(text, agentName ?? null, abort.signal);
    if (!mp3Buffer) {
      log.warn('No MP3 buffer — falling back to Windows SAPI');
      await speakLocalFallback(text);
      return;
    }
    if (electronAudioEmitter) {
      log.info('Emitting voice audio to Electron', { bytes: mp3Buffer.length, agent: agentName ?? 'core' });
      electronAudioEmitter({ base64Mp3: mp3Buffer.toString('base64'), agentName: agentName ?? null });
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, Math.min(8000, Math.max(2000, text.length * 65)));
      });
      return;
    }
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tmpPath = join(tmpdir(), `ai-cc-${stamp}.mp3`);
    await writeFile(tmpPath, mp3Buffer);
    if (playbackCancelled) {
      log.info('Playback skipped - cancelled before start');
      return;
    }
    await playMp3File(tmpPath);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      log.info('TTS aborted by user');
      return;
    }
    log.warn('TTS request failed — using local fallback', { message: messageOf(err) });
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
    try { currentChild.kill(); }
    catch (err) { log.warn('Kill playback failed', { message: messageOf(err) }); }
    currentChild = null;
  }
}

export async function listVoices(): Promise<string[]> {
  return ['reem-khaleeji'];
}
