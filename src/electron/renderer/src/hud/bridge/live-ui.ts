/** Inline live-voice bar plus the hands-free conversation controller that drives it. */

import type { ApexHudApi } from '../types';
import { createTtsPlayer } from './tts';
import type { VoiceAudioPayload } from './tts';
import { createVoiceRecorder } from './voice';

export type LivePhase = 'off' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export type LiveVoiceUiOptions = { onInterrupt: () => void; onClose: () => void };

export interface LiveVoiceUi {
  open(): void;
  close(): void;
  setPhase(phase: LivePhase): void;
  setLevel(level: number): void;
  setUserText(text: string): void;
  setAssistantText(text: string): void;
  isOpen(): boolean;
}

// Static, developer-authored phase strings (no user input) — safe for innerHTML.
const PHASE_HTML: Record<Exclude<LivePhase, 'off'>, string> = {
  listening: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg> أستمع إليك...`,
  transcribing: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12h3"/><path d="M7 8v8"/><path d="M11 4v16"/><path d="M15 7v10"/><path d="M19 9v6"/><path d="M22 12h-2"/></svg> يحوّل...`,
  thinking: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg> يفكر...`,
  speaking: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg> يتحدث...`,
};
const IDLE_TEXT = '...';

interface LiveNodes {
  root: HTMLDivElement;
  dot: HTMLSpanElement;
  status: HTMLSpanElement;
  label: HTMLSpanElement;
  caption: HTMLSpanElement;
  interrupt: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`[apex-live] missing ${selector}`);
  return found;
}

function buildLiveDom(): LiveNodes {
  const root = document.createElement('div');
  root.className = 'live-inline-bar';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.innerHTML =
    `<div class="live-bar-head">` +
    `<span class="live-level"><span class="live-level-dot"></span></span>` +
    `<span class="live-status-text"></span>` +
    `<span class="live-bar-actions">` +
    `<button type="button" class="live-btn live-btn-interrupt"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> قاطع</button>` +
    `<button type="button" class="live-btn live-btn-close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg> إيقاف المحادثة</button>` +
    `</span></div>` +
    `<p class="live-caption" dir="rtl">` +
    `<span class="live-caption-label">المساعد:</span>` +
    `<span class="live-caption-text">${IDLE_TEXT}</span></p>`;
  (document.getElementById('hud-root') ?? document.body).appendChild(root);
  return {
    root,
    dot: must<HTMLSpanElement>(root, '.live-level-dot'),
    status: must<HTMLSpanElement>(root, '.live-status-text'),
    label: must<HTMLSpanElement>(root, '.live-caption-label'),
    caption: must<HTMLSpanElement>(root, '.live-caption-text'),
    interrupt: must<HTMLButtonElement>(root, '.live-btn-interrupt'),
    closeBtn: must<HTMLButtonElement>(root, '.live-btn-close'),
  };
}

export function createLiveVoiceUi(options: LiveVoiceUiOptions): LiveVoiceUi {
  const nodes = buildLiveDom();
  let open = false;

  const setPhase = (phase: LivePhase): void => {
    nodes.root.dataset.phase = phase; if (phase !== 'off') nodes.status.innerHTML = PHASE_HTML[phase];
  };

  const setLevel = (level: number): void => {
    const clamped = Math.max(0, Math.min(1, level));
    nodes.dot.style.transform = `scale(${(0.75 + clamped * 0.9).toFixed(3)})`;
    nodes.dot.style.opacity = String(0.4 + clamped * 0.6);
  };

  const setCaption = (label: string, text: string): void => {
    nodes.label.textContent = label; nodes.caption.textContent = text.trim() || IDLE_TEXT;
  };
  const setUserText = (text: string): void => setCaption('أنت:', text);
  const setAssistantText = (text: string): void => setCaption('المساعد:', text);
  const close = (): void => {
    open = false;
    nodes.root.classList.remove('is-open');
    setPhase('off');
  };
  const openUi = (): void => {
    open = true;
    setUserText(''); setLevel(0); setPhase('listening');
    nodes.root.classList.add('is-open');
  };
  nodes.interrupt.addEventListener('click', (): void => options.onInterrupt());
  nodes.closeBtn.addEventListener('click', (): void => options.onClose());

  return {
    open: openUi,
    close,
    setPhase,
    setLevel,
    setUserText,
    setAssistantText,
    isOpen: (): boolean => open,
  };
}

export interface LiveSession {
  toggle(): void;
  exit(): void;
  pushAudio(payload: VoiceAudioPayload): void;
  stopAudio(): void;
  stopPlayback(): void;
}

/** Hands-free loop: listen → transcribe → dispatch → speak → listen again. */
export function createLiveSession(
  app: ApexHudApi,
  api: Window['api'],
  send: (text: string) => Promise<string | null>,
): LiveSession {
  let live = false;
  let reopen = 0;
  let speaking = false;

  const listenSoon = (delay: number): void => {
    if (reopen !== 0) window.clearTimeout(reopen);
    reopen = window.setTimeout((): void => {
      reopen = 0; if (!live || speaking) return;
      app.setCoreStatus('LISTENING');
      startVoice();
    }, delay);
  };
  const tts = createTtsPlayer((): void => {
    speaking = false;
    if (live) listenSoon(300);
  });
  const stopPlayback = (): void => { tts.stop(); };
  const stopAudio = (): void => {
    stopPlayback();
    void api.stopVoice().catch((error: unknown): void => { console.error('[apex-live] stopVoice failed', error); });
  };
  const exit = (): void => {
    if (!live) return;
    live = false;
    if (reopen !== 0) window.clearTimeout(reopen); reopen = 0;
    voice.stop();
    stopAudio();
    ui.close();
    app.setCoreStatus('IDLE');
  };
  const startVoice = (): void => {
    void voice.start().then((ok: boolean): void => {
      if (!ok && live) exit();
    });
  };
  const ui = createLiveVoiceUi({
    onInterrupt: (): void => { speaking = false; stopAudio(); ui.setPhase('listening'); startVoice(); },
    onClose: exit,
  });
  const voice = createVoiceRecorder(app, api, {
    onTranscript: (text: string): void => {
      if (!live) return;
      ui.setUserText(text);
      ui.setPhase('thinking');
      void send(text).then((content: string | null): void => {
        if (!live) return;
        if (content) {
          ui.setAssistantText(content);
          if (tts.isPlaying()) ui.setPhase('speaking');
          else if (reopen === 0) listenSoon(2500);
        } else listenSoon(800);
      });
    },
    onLevel: (level: number): void => ui.setLevel(level),
    onPhase: (phase): void => {
      if (!live) return;
      if (phase === 'listening') app.setCoreStatus('LISTENING');
      if (phase === 'idle' && !speaking) listenSoon(600);
      ui.setPhase(phase === 'idle' ? 'listening' : phase);
    },
    autoStopOnSilence: true,
  });

  return {
    exit,
    toggle: (): void => {
      if (live) exit();
      else {
        live = true;
        app.setCoreStatus('LISTENING');
        ui.open();
        startVoice();
      }
    },
    pushAudio: (payload: VoiceAudioPayload): void => {
      tts.push(payload);
      if (!live) return;
      speaking = true;
      if (reopen !== 0) window.clearTimeout(reopen); reopen = 0;
      voice.stop();
      ui.setPhase('speaking');
    },
    stopAudio,
    stopPlayback,
  };
}
