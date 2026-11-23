import { errorMessage } from '../dom';
import type { ApexHudApi } from '../types';
import { createSilenceDetector } from './vad';

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject): void => {
    const reader = new FileReader();
    reader.onloadend = (): void => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('read failed'));
    };
    reader.readAsDataURL(blob);
  });
}

/** Records microphone audio and sends it to Groq Whisper through the main process. */
export function createVoiceRecorder(
  app: ApexHudApi,
  api: RendererApi,
  callbacks: VoiceCallbacks,
): VoiceRecorder {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let stopDetector: (() => void) | null = null;
  let chunks: Blob[] = [];
  let recording = false;

  const release = (): void => {
    stopDetector?.();
    stopDetector = null;
    stream?.getTracks().forEach((track: MediaStreamTrack): void => track.stop());
    stream = null;
  };

  const handleStop = async (): Promise<void> => {
    const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
    chunks = [];
    release();
    recorder = null;
    callbacks.onPhase?.('transcribing');

    if (blob.size < 2000) {
      callbacks.onPhase?.('idle');
      return;
    }

    app.addSystemLog('Voice Engine', 'Transcribing audio via STT engine...');
    try {
      const result = await api.transcribeAudio(await blobToBase64(blob));
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
    stopDetector?.();
    stopDetector = null;
    if (recorder && recording) {
      recording = false;
      recorder.stop();
    }
  };

  const start = async (): Promise<boolean> => {
    if (recording || recorder) return true;
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
      const active = new MediaRecorder(
        media,
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? { mimeType: 'audio/webm;codecs=opus' }
          : undefined,
      );
      recorder = active;
      chunks = [];
      active.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      active.onstop = (): void => {
        recording = false;
        void handleStop();
      };
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
      active.start();
      recording = true;
      app.addSystemLog('Voice Engine', 'Microphone recording started');
      callbacks.onPhase?.('listening');
      return true;
    } catch (error) {
      recording = false;
      release();
      recorder = null;
      app.addSystemLog('Voice Engine', `Microphone error: ${errorMessage(error)}`);
      app.showToast('Microphone unavailable');
      app.setCoreStatus('IDLE');
      return false;
    }
  };

  return { start, stop };
}
