import { byId, errorMessage } from '../dom';
import type { ApexHudApi } from '../types';

type RendererApi = Window['api'];

export interface VoiceRecorder {
  start(): Promise<void>;
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
export function createVoiceRecorder(app: ApexHudApi, api: RendererApi): VoiceRecorder {
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let recording = false;

  const releaseStream = (): void => {
    if (!stream) return;
    stream.getTracks().forEach((track: MediaStreamTrack): void => track.stop());
    stream = null;
  };

  const handleStop = async (): Promise<void> => {
    const mime = recorder?.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    chunks = [];
    releaseStream();
    recorder = null;
    if (blob.size < 2000) return;

    app.addSystemLog('Voice Engine', 'Transcribing audio via Groq Whisper...');
    try {
      const base64 = await blobToBase64(blob);
      const result = await api.transcribeAudio(base64);
      if (result.ok && result.text) {
        const input = byId<HTMLInputElement>('command-input');
        if (input) input.value = result.text;
        app.addSystemLog('Voice Engine', `Transcribed: ${result.text.slice(0, 120)}`);
        app.showToast('Voice transcribed — press Enter to dispatch');
      } else {
        app.addSystemLog('Voice Engine', `Transcription failed: ${result.error ?? 'unknown'}`);
        app.showToast('Transcription failed');
      }
    } catch (error) {
      app.addSystemLog('Voice Engine', `Transcription error: ${errorMessage(error)}`);
      app.showToast('Transcription error');
    }
  };

  const start = async (): Promise<void> => {
    if (recording) return;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = media;
      const options: MediaRecorderOptions | undefined = MediaRecorder.isTypeSupported(
        'audio/webm;codecs=opus',
      )
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;
      const active = new MediaRecorder(media, options);
      recorder = active;
      chunks = [];

      active.ondataavailable = (event: BlobEvent): void => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      active.onstop = (): void => {
        void handleStop();
      };

      active.start();
      recording = true;
      app.addSystemLog('Voice Engine', 'Microphone recording started');
    } catch (error) {
      recording = false;
      app.addSystemLog('Voice Engine', `Microphone error: ${errorMessage(error)}`);
      app.showToast('Microphone unavailable');
      app.setCoreStatus('THINKING');
    }
  };

  const stop = (): void => {
    if (recorder && recording) {
      recording = false;
      recorder.stop();
    }
  };

  return { start, stop };
}
