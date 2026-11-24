/** Automatic silence detection (VAD) built on the Web Audio API. */

const SPEECH_THRESHOLD = 0.018;
const SILENCE_MS = 1800;
const NO_SPEECH_TIMEOUT_MS = 8000;
const POLL_MS = 100;
const LEVEL_GAIN = 8;

interface WebkitAudioWindow {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Watches a live microphone stream and fires `onSilence` exactly once:
 * either after the speaker talks and then pauses, or after the initial
 * no-speech timeout. Returns a cleanup function that stops the poller
 * and closes the AudioContext.
 */
export function createSilenceDetector(
  stream: MediaStream,
  onSilence: () => void,
  onLevel?: (level: number) => void,
): () => void {
  const AudioCtor =
    window.AudioContext ?? (window as unknown as WebkitAudioWindow).webkitAudioContext;
  if (!AudioCtor) return (): void => {};

  const ctx = new AudioCtor();
  void ctx.resume().catch((error: unknown): void => {
    console.error('[apex-vad] resume failed', error);
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  const startedAt = Date.now();
  let hasSpoken = false;
  let silentSince = 0;
  let timer = 0;

  const fire = (): void => {
    window.clearInterval(timer);
    onSilence();
  };

  const tick = (): void => {
    analyser.getFloatTimeDomainData(samples);

    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i] ?? 0;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / samples.length);
    onLevel?.(Math.min(1, rms * LEVEL_GAIN));

    if (rms >= SPEECH_THRESHOLD) {
      hasSpoken = true;
      silentSince = 0;
      return;
    }

    if (!hasSpoken) {
      if (Date.now() - startedAt >= NO_SPEECH_TIMEOUT_MS) fire();
      return;
    }

    if (silentSince === 0) {
      silentSince = Date.now();
      return;
    }

    if (Date.now() - silentSince >= SILENCE_MS) fire();
  };

  timer = window.setInterval(tick, POLL_MS);

  return (): void => {
    window.clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
    void ctx.close().catch((error: unknown): void => {
      console.error('[apex-vad] close failed', error);
    });
  };
}
