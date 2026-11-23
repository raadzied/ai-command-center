export interface VoiceAudioPayload {
  base64Mp3: string;
  agentName: string | null;
}

export interface TtsPlayer {
  push(payload: VoiceAudioPayload): void;
  stop(): void;
  isPlaying(): boolean;
}

/** Sequential playback of agent voice responses streamed from the main process. */
export function createTtsPlayer(onIdle?: () => void): TtsPlayer {
  const queue: VoiceAudioPayload[] = [];
  let current: HTMLAudioElement | null = null;

  const playNext = (): void => {
    if (current || queue.length === 0) return;
    const item = queue.shift();
    if (!item) return;

    const audio = new Audio(`data:audio/mp3;base64,${item.base64Mp3}`);
    audio.playbackRate =
      item.agentName === 'coder' ? 1.12 : item.agentName === 'designer' ? 1.05 : 1.0;
    current = audio;

    const advance = (): void => {
      if (current !== audio) return;
      current = null;
      playNext();
      if (queue.length === 0 && !current) onIdle?.();
    };

    audio.onended = advance;
    audio.onerror = advance;
    void audio.play().catch((error: unknown): void => {
      console.error('[apex-tts] playback failed', error);
      advance();
    });
  };

  return {
    push: (payload: VoiceAudioPayload): void => {
      queue.push(payload);
      playNext();
    },
    stop: (): void => {
      queue.length = 0;
      if (current) {
        current.onended = null;
        current.onerror = null;
        current.pause();
        current = null;
      }
    },
    isPlaying: (): boolean => current !== null || queue.length > 0,
  };
}
