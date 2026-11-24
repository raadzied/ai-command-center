import { errorMessage } from '../dom';
import type { ApexHudApi } from '../types';
import { createSilenceDetector } from './vad';
import { encodeWav16kMono, mixToMono, resampleLinearTo16k } from './wav-encode';

type RendererApi = Window['api'];

export type VoicePhase = 'listening' | 'transcribing' | 'idle';

export interface VoiceCallbacks {
  onTranscript: (text: string) => void;
  onLevel?: (level: number) => void;
  onPhase?: (phase: VoicePhase) => void;
  autoStopOnSilence?: boolean;
}

export interface VoiceRecorder {
  start(): Promise<boolean>;
  stop(): void;
}

const PREROLL_MS = 400;
const MIN_AUDIO_MS = 450;
const SPEECH_RMS = 0.015;

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Captures raw PCM from the microphone and sends a 16 kHz mono WAV to IPC. */
export function createVoiceRecorder(
  app: ApexHudApi,
  api: RendererApi,
  callbacks: VoiceCallbacks,
): VoiceRecorder {
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let micNode: MediaStreamAudioSourceNode | null = null;
  let sink: GainNode | null = null;
  let stopDetector: (() => void) | null = null;
  let samples: number[] = [];
  let onsetIndex = -1;
  let recording = false;

  const audioCtor = (): typeof AudioContext | null =>
    window.AudioContext
    ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    ?? null;

  const release = (): void => {
    stopDetector?.(); stopDetector = null;
    processor?.disconnect(); micNode?.disconnect(); sink?.disconnect();
    processor = null; micNode = null; sink = null;
    if (ctx) {
      void ctx.close().catch((error: unknown): void => {
        console.error('[apex-voice] AudioContext close failed', error);
      });
    }
    ctx = null;
    stream?.getTracks().forEach((track: MediaStreamTrack): void => track.stop());
    stream = null;
  };

  const finalize = async (): Promise<void> => {
    const activeCtx = ctx;
    const captured = samples;
    const onset = onsetIndex;
    samples = []; onsetIndex = -1; recording = false;
    release();
    if (!activeCtx) return;

    const preroll = Math.round(activeCtx.sampleRate * PREROLL_MS / 1000);
    const selected = captured.slice(onset < 0 ? 0 : Math.max(0, onset - preroll));
    const durationMs = (selected.length / activeCtx.sampleRate) * 1000;
    if (durationMs < MIN_AUDIO_MS) {
      app.addSystemLog('Voice Engine', `Audio too short (${Math.round(durationMs)}ms) — skipped`);
      callbacks.onPhase?.('idle');
      return;
    }
    let peak = 0;
    for (const value of selected) peak = Math.max(peak, Math.abs(value));
    if (peak < SPEECH_RMS) {
      app.addSystemLog('Voice Engine', 'Silent capture skipped');
      callbacks.onPhase?.('idle');
      return;
    }

    callbacks.onPhase?.('transcribing');
    const resampled = resampleLinearTo16k(new Float32Array(selected), activeCtx.sampleRate);
    const wav = encodeWav16kMono(resampled);
    app.addSystemLog('Voice Engine',
      `PCM ${Math.round(durationMs)}ms @ ${activeCtx.sampleRate}Hz -> 16kHz mono WAV`);
    try {
      const result = await api.transcribeAudio(base64FromBytes(new Uint8Array(wav)), 'audio/wav');
      if (result.ok && result.text) {
        app.addSystemLog('Voice Engine', `Transcribed: ${result.text.slice(0, 120)}`);
        callbacks.onTranscript(result.text);
        return;
      }
      if (result.ok) {
        app.addSystemLog('Voice Engine', 'No speech detected — empty transcript ignored');
        callbacks.onPhase?.('idle');
        return;
      }
      app.addSystemLog('Voice Engine', `Transcription failed: ${result.error ?? 'unknown'}`);
      app.showToast('Transcription failed');
    } catch (error) {
      app.addSystemLog('Voice Engine', `Transcription error: ${errorMessage(error)}`);
      app.showToast('Transcription error');
    }
    callbacks.onPhase?.('idle');
  };

  const stop = (): void => {
    stopDetector?.(); stopDetector = null;
    if (recording) {
      recording = false;
      void finalize();
    }
  };

  const start = async (): Promise<boolean> => {
    if (recording || ctx) return true;
    const Ctor = audioCtor();
    if (!Ctor) {
      app.addSystemLog('Voice Engine', 'Web Audio is unavailable');
      app.showToast('Microphone unavailable');
      return false;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      stream = media;
      const audio = new Ctor(); ctx = audio;
      const mic = audio.createMediaStreamSource(media); micNode = mic;
      const node = audio.createScriptProcessor(4096, 2, 2); processor = node;
      const silent = audio.createGain(); silent.gain.value = 0; sink = silent;
      node.onaudioprocess = (event: AudioProcessingEvent): void => {
        if (!recording) return;
        const input = event.inputBuffer;
        const channels: Float32Array[] = [];
        for (let c = 0; c < input.numberOfChannels; c += 1) {
          channels.push(input.getChannelData(c));
        }
        const mono = mixToMono(channels);
        let peak = 0;
        for (const value of mono) {
          samples.push(value);
          if (Math.abs(value) > peak) peak = Math.abs(value);
        }
        if (onsetIndex < 0 && peak >= SPEECH_RMS) onsetIndex = samples.length - mono.length;
      };
      samples = []; onsetIndex = -1; recording = true;
      mic.connect(node); node.connect(silent); silent.connect(audio.destination);
      void audio.resume().catch((error: unknown): void => {
        console.error('[apex-voice] AudioContext resume failed', error);
      });
      if (callbacks.autoStopOnSilence === true) {
        stopDetector = createSilenceDetector(
          media,
          (): void => {
            app.addSystemLog('Voice Engine', 'Silence detected — stopping capture');
            stop();
          },
          callbacks.onLevel,
        );
      }
      app.addSystemLog('Voice Engine', 'Raw PCM microphone capture started');
      callbacks.onPhase?.('listening');
      return true;
    } catch (error) {
      recording = false; release();
      app.addSystemLog('Voice Engine', `Microphone error: ${errorMessage(error)}`);
      app.showToast('Microphone unavailable');
      app.setCoreStatus('IDLE');
      return false;
    }
  };

  return { start, stop };
}
