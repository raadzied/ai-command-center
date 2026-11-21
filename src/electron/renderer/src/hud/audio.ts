import type { ApexAudioApi } from './types';

interface WebkitWindow {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Procedural tactical sound engine built on the Web Audio API.
 * No external audio assets are required.
 */
export function createAudio(): ApexAudioApi {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let humOsc: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let enabled = true;
  let booted = false;

  const ensure = (): AudioContext | null => {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AudioCtor = window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
        if (!AudioCtor) return null;
        ctx = new AudioCtor();
        master = ctx.createGain();
        master.gain.value = 0.55;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') {
        void ctx.resume().catch((error: unknown): void => {
          console.error('[apex-audio] resume failed', error);
        });
      }
      return ctx;
    } catch (error) {
      console.error('[apex-audio] context failed', error);
      return null;
    }
  };

  const startHum = (): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out || humOsc) return;
    try {
      const osc = audio.createOscillator();
      const companion = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();

      osc.type = 'sine';
      osc.frequency.value = 54;
      companion.type = 'triangle';
      companion.frequency.value = 108;

      filter.type = 'lowpass';
      filter.frequency.value = 140;
      gain.gain.value = 0.035;

      osc.connect(filter);
      companion.connect(filter);
      filter.connect(gain);
      gain.connect(out);

      osc.start();
      companion.start();

      humOsc = osc;
      humGain = gain;
    } catch (error) {
      console.error('[apex-audio] hum failed', error);
    }
  };

  const setHumVolume = (volume: number): void => {
    if (!ctx || !humGain) return;
    const now = ctx.currentTime;
    humGain.gain.cancelScheduledValues(now);
    humGain.gain.linearRampToValueAtTime(enabled ? volume : 0, now + 0.35);
  };

  const playClick = (pitch = 920): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.32, now + 0.045);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.055);
    } catch (error) {
      console.error('[apex-audio] click failed', error);
    }
  };

  const playHover = (): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1450, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.02);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.03);
    } catch (error) {
      console.error('[apex-audio] hover failed', error);
    }
  };

  const playBoot = (): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      booted = true;
      const now = audio.currentTime;

      const sub = audio.createOscillator();
      const subGain = audio.createGain();
      const subFilter = audio.createBiquadFilter();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(36, now);
      sub.frequency.exponentialRampToValueAtTime(118, now + 1.05);
      subFilter.type = 'lowpass';
      subFilter.frequency.setValueAtTime(120, now);
      subFilter.frequency.exponentialRampToValueAtTime(950, now + 0.95);
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.32, now + 0.45);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
      sub.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(out);
      sub.start(now);
      sub.stop(now + 1.4);

      const notes = [261.63, 392.0, 523.25, 783.99];
      notes.forEach((freq: number, index: number): void => {
        const at = now + 0.18 + index * 0.11;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.linearRampToValueAtTime(0.14, at + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.65);
        osc.connect(gain);
        gain.connect(out);
        osc.start(at);
        osc.stop(at + 0.7);
      });

      startHum();
      setHumVolume(0.038);
    } catch (error) {
      console.error('[apex-audio] boot failed', error);
    }
  };

  const playDispatch = (): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      const now = audio.currentTime;
      [520, 780, 1180].forEach((freq: number, index: number): void => {
        const at = now + index * 0.045;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.25, at + 0.1);
        gain.gain.setValueAtTime(0.16, at);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
        osc.connect(gain);
        gain.connect(out);
        osc.start(at);
        osc.stop(at + 0.18);
      });
    } catch (error) {
      console.error('[apex-audio] dispatch failed', error);
    }
  };

  const playVoice = (listening: boolean): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      if (listening) {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
      } else {
        osc.frequency.setValueAtTime(760, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.16);
      }
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch (error) {
      console.error('[apex-audio] voice tone failed', error);
    }
  };

  const playKill = (): void => {
    const audio = ensure();
    const out = master;
    if (!audio || !out) return;
    try {
      const now = audio.currentTime;

      const osc = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      const gain = audio.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.85);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(90, now + 0.85);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.92);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      osc.start(now);
      osc.stop(now + 0.95);

      [0, 0.14].forEach((offset: number): void => {
        const beep = audio.createOscillator();
        const beepGain = audio.createGain();
        beep.type = 'square';
        beep.frequency.setValueAtTime(310, now + offset);
        beep.frequency.linearRampToValueAtTime(180, now + offset + 0.1);
        beepGain.gain.setValueAtTime(0.14, now + offset);
        beepGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
        beep.connect(beepGain);
        beepGain.connect(out);
        beep.start(now + offset);
        beep.stop(now + offset + 0.12);
      });

      const bufferSize = Math.floor(audio.sampleRate * 0.22);
      const noiseBuffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }
      const noise = audio.createBufferSource();
      noise.buffer = noiseBuffer;
      const noiseGain = audio.createGain();
      noiseGain.gain.setValueAtTime(0.16, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      noise.connect(noiseGain);
      noiseGain.connect(out);
      noise.start(now);

      setHumVolume(0);
    } catch (error) {
      console.error('[apex-audio] kill failed', error);
    }
  };

  const toggleEnabled = (): boolean => {
    enabled = !enabled;
    if (enabled) {
      ensure();
      playClick(1080);
      setHumVolume(0.038);
    } else {
      setHumVolume(0);
    }
    return enabled;
  };

  const unlockAndBootOnce = (): void => {
    if (!booted && enabled) {
      playBoot();
    }
  };

  return {
    playClick,
    playHover,
    playBoot,
    playDispatch,
    playVoice,
    playKill,
    toggleEnabled,
    unlockAndBootOnce,
    isEnabled: (): boolean => enabled,
  };
}
