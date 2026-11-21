import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ApprovalRequestData } from './window';

interface ApprovalModalProps {
  request: ApprovalRequestData | null;
  onRespond: (approved: boolean) => void;
}

interface Agent {
  id: string;
  name: string;
  active: boolean;
  icon: string;
  role: string;
  task: string;
  logs: string[];
}

interface Resource {
  id: string;
  name: string;
  pct: number;
  icon: string;
  type: string;
  desc: string;
}

interface MCPServer {
  id: string;
  name: string;
  enabled: boolean;
  latency: string;
}

interface MemoryEntry {
  key: string;
  value: string;
  score: string;
}

interface SystemLog {
  time: string;
  source: string;
  msg: string;
}

interface AppState {
  coreStatus: 'THINKING' | 'LISTENING' | 'IDLE' | 'HALTED';
  previousStatus: 'THINKING' | 'LISTENING' | 'IDLE' | 'HALTED';
  focusMode: boolean;
  burstUntil: number;
  elapsedSeconds: number;
  selectedNodeId: string | null;
  audioLevel: number;
  mcpServers: MCPServer[];
  memoryEntries: MemoryEntry[];
  systemLogs: SystemLog[];
}

const ICONS = {
  orchestrator: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"></path></svg>`,
  coder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline><line x1="14" y1="4" x2="10" y2="20"></line></svg>`,
  designer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`,
  advisor: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>`,
  browser: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  commander: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  sqlite: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`,
  context: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="7" y1="6.5" x2="7.01" y2="6.5"></line><line x1="10" y1="6.5" x2="10.01" y2="6.5"></line></svg>`,
  mcp: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="7" rx="1.5"></rect><rect x="2" y="14" width="20" height="7" rx="1.5"></rect><line x1="6" y1="6.5" x2="6.01" y2="6.5"></line><line x1="6" y1="17.5" x2="6.01" y2="17.5"></line></svg>`,
  filesystem: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
  voice: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
  telemetry: `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"></rect><polyline points="7 12 10 12 11.5 9 13 15 14.5 12 17 12"></polyline></svg>`
};

const agents: Agent[] = [
  { id: 'orchestrator', name: 'Orchestrator', active: true, icon: ICONS.orchestrator, role: 'Central DAG Planner & Dispatcher', task: 'Coordinating multi-agent execution pipeline', logs: ['Routing intent graph to active specialists', 'Monitoring token budget and latency'] },
  { id: 'coder', name: 'Coder', active: false, icon: ICONS.coder, role: 'TypeScript / Electron Engineer', task: 'Standby — awaiting code generation spec', logs: ['Last build: 0 TypeScript errors', 'Awaiting @Coder dispatch'] },
  { id: 'designer', name: 'Designer', active: true, icon: ICONS.designer, role: 'Tactical UI & Visual Architect', task: 'Rendering 60fps topographic HUD shaders', logs: ['Verified contrast ratios & SVG alignments', 'Optimizing canvas DPI scaling'] },
  { id: 'advisor', name: 'Advisor', active: true, icon: ICONS.advisor, role: 'Security & Strategy Auditor', task: 'Enforcing Human-in-the-Loop guardrails', logs: ['All shell commands require approval', 'Zero unauthorized network calls detected'] },
  { id: 'browser', name: 'Browser Pilot', active: false, icon: ICONS.browser, role: 'Playwright Automation Agent', task: 'Idle — headless session pooled', logs: ['Playwright MCP server ready', 'No active viewport session'] },
  { id: 'commander', name: 'OS Commander', active: true, icon: ICONS.commander, role: 'Local System & IPC Executor', task: 'Bridging Electron IPC & local tools', logs: ['Desktop Commander heartbeat OK', 'System permissions verified'] }
];

const resources: Resource[] = [
  { id: 'sqlite', name: 'SQLite Memory', pct: 58, icon: ICONS.sqlite, type: 'memory', desc: 'Local persistent vector & episodic SQLite store' },
  { id: 'context', name: 'Context Window', pct: 100, icon: ICONS.context, type: 'context', desc: 'Active working context window (128k / 128k cached)' },
  { id: 'mcp', name: 'MCP Servers', pct: 15, icon: ICONS.mcp, type: 'mcp', desc: 'Model Context Protocol tool server load' },
  { id: 'filesystem', name: 'File System', pct: 36, icon: ICONS.filesystem, type: 'fs', desc: 'Indexed workspace files in E:\\ai-command-center' },
  { id: 'voice', name: 'Voice Engine', pct: 8, icon: ICONS.voice, type: 'voice', desc: 'Groq Whisper v3 Turbo dictation pipeline' },
  { id: 'telemetry', name: 'System Telemetry', pct: 55, icon: ICONS.telemetry, type: 'telemetry', desc: 'Real-time CPU / GPU / RAM utilization' }
];

const initialMcpServers: MCPServer[] = [
  { id: 'playwright', name: 'Playwright Browser MCP', enabled: true, latency: '18ms' },
  { id: 'desktop', name: 'Desktop Commander MCP', enabled: true, latency: '9ms' },
  { id: 'sqlite', name: 'SQLite Vector Memory', enabled: true, latency: '4ms' },
  { id: 'filesystem', name: 'Local File System MCP', enabled: true, latency: '6ms' }
];

const initialMemoryEntries: MemoryEntry[] = [
  { key: 'project.root', value: 'E:\\ai-command-center (v4.1)', score: '0.98' },
  { key: 'voice.engine', value: 'Groq whisper-large-v3-turbo [Ctrl+Space]', score: '0.95' },
  { key: 'safety.policy', value: 'Human-in-the-Loop active for OS ops', score: '0.92' },
  { key: 'ui.theme', value: 'Tactical Dark / Cyan-Amber Constellation', score: '0.89' }
];

const initialSystemLogs: SystemLog[] = [
  { time: '00:08:49', source: 'Orchestrator', msg: 'Initialized Sentient Core neural mesh.' },
  { time: '00:08:51', source: 'SQLite Memory', msg: 'Loaded 1,428 vector embeddings (58% pool).' },
  { time: '00:08:53', source: 'Designer', msg: 'Synced 16:9 widescreen tactical HUD layout.' },
  { time: '00:08:54', source: 'Advisor', msg: 'Verified Human-in-the-Loop safety boundaries.' },
  { time: '00:08:55', source: 'OS Commander', msg: 'Listening on Electron IPC bridge [READY].' }
];

export function ApprovalModal({
  request,
  onRespond,
}: ApprovalModalProps): React.JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftWingRef = useRef<HTMLDivElement>(null);
  const rightWingRef = useRef<HTMLDivElement>(null);
  const pathsGroupRef = useRef<SVGGElement>(null);
  const pulsesGroupRef = useRef<SVGGElement>(null);
  const inspectorDrawerRef = useRef<HTMLDivElement>(null);
  const hudToastRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const humOscRef = useRef<OscillatorNode | null>(null);
  const humGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const audioEnabledRef = useRef(true);
  const hasBootedRef = useRef(false);

  const [state, setState] = useState<AppState>({
    coreStatus: 'THINKING',
    previousStatus: 'THINKING',
    focusMode: false,
    burstUntil: 0,
    elapsedSeconds: 9 * 60 + 43,
    selectedNodeId: null,
    audioLevel: 0.25,
    mcpServers: initialMcpServers,
    memoryEntries: initialMemoryEntries,
    systemLogs: initialSystemLogs
  });

  const [inspectorContent, setInspectorContent] = useState<{
    title: string;
    subtitle: string;
    badgeColor: string;
    body: React.ReactNode;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string>('');

  // Audio Engine
  const ensureAudioContext = useCallback(() => {
    if (!audioEnabledRef.current) return null;
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return null;
        audioContextRef.current = new AudioCtx();
        masterGainRef.current = audioContextRef.current.createGain();
        masterGainRef.current.gain.value = 0.55;
        masterGainRef.current.connect(audioContextRef.current.destination);
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  }, []);

  const startAmbientHum = useCallback(() => {
    const ac = ensureAudioContext();
    if (!ac || humOscRef.current) return;
    try {
      humOscRef.current = ac.createOscillator();
      const humOsc2 = ac.createOscillator();
      const filter = ac.createBiquadFilter();
      humGainRef.current = ac.createGain();

      humOscRef.current.type = 'sine';
      humOscRef.current.frequency.value = 54;
      humOsc2.type = 'triangle';
      humOsc2.frequency.value = 108;

      filter.type = 'lowpass';
      filter.frequency.value = 140;

      humGainRef.current.gain.value = 0.035;

      humOscRef.current.connect(filter);
      humOsc2.connect(filter);
      filter.connect(humGainRef.current);
      humGainRef.current.connect(masterGainRef.current!);

      humOscRef.current.start();
      humOsc2.start();
      (humOscRef.current as any)._companion = humOsc2;
    } catch {}
  }, [ensureAudioContext]);

  const setHumVolume = useCallback((vol: number) => {
    if (!audioContextRef.current || !humGainRef.current) return;
    const now = audioContextRef.current.currentTime;
    humGainRef.current.gain.cancelScheduledValues(now);
    humGainRef.current.gain.linearRampToValueAtTime(audioEnabledRef.current ? vol : 0, now + 0.35);
  }, []);

  const playClick = useCallback((pitch = 920) => {
    const ac = ensureAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.32, now + 0.045);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(masterGainRef.current!);
    osc.start(now);
    osc.stop(now + 0.055);
  }, [ensureAudioContext]);

  const playHover = useCallback(() => {
    const ac = ensureAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.02);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    osc.connect(gain);
    gain.connect(masterGainRef.current!);
    osc.start(now);
    osc.stop(now + 0.03);
  }, [ensureAudioContext]);

  const playBoot = useCallback(() => {
    const ac = ensureAudioContext();
    if (!ac) return;
    hasBootedRef.current = true;
    const now = ac.currentTime;

    const sub = ac.createOscillator();
    const subGain = ac.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(36, now);
    sub.frequency.exponentialRampToValueAtTime(118, now + 1.05);

    const subFilter = ac.createBiquadFilter();
    subFilter.type = 'lowpass';
    subFilter.frequency.setValueAtTime(120, now);
    subFilter.frequency.exponentialRampToValueAtTime(950, now + 0.95);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.32, now + 0.45);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

    sub.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(masterGainRef.current!);
    sub.start(now);
    sub.stop(now + 1.4);

    const notes = [261.63, 392.0, 523.25, 783.99];
    notes.forEach((freq, idx) => {
      const t = now + 0.18 + idx * 0.11;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(g);
      g.connect(masterGainRef.current!);
      osc.start(t);
      osc.stop(t + 0.7);
    });

    startAmbientHum();
    setHumVolume(0.038);
  }, [ensureAudioContext, startAmbientHum, setHumVolume]);

  const playDispatch = useCallback(() => {
    const ac = ensureAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    [520, 780, 1180].forEach((freq, i) => {
      const t = now + i * 0.045;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.1);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(masterGainRef.current!);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }, [ensureAudioContext]);

  const playVoice = useCallback((isListening: boolean) => {
    const ac = ensureAudioContext();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    if (isListening) {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.16);
    } else {
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.16);
    }
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(masterGainRef.current!);
    osc.start(now);
    osc.stop(now + 0.24);
  }, [ensureAudioContext]);

  const playKill = useCallback(() => {
    const ac = ensureAudioContext();
    if (!ac) return;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const g = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(26, now + 0.85);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.85);

    g.gain.setValueAtTime(0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.92);

    osc.connect(filter);
    filter.connect(g);
    g.connect(masterGainRef.current!);
    osc.start(now);
    osc.stop(now + 0.95);

    [0, 0.14].forEach(offset => {
      const beep = ac.createOscillator();
      const bg = ac.createGain();
      beep.type = 'square';
      beep.frequency.setValueAtTime(310, now + offset);
      beep.frequency.linearRampToValueAtTime(180, now + offset + 0.1);
      bg.gain.setValueAtTime(0.14, now + offset);
      bg.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
      beep.connect(bg);
      bg.connect(masterGainRef.current!);
      beep.start(now + offset);
      beep.stop(now + offset + 0.12);
    });

    const bufferSize = Math.floor(ac.sampleRate * 0.22);
    const noiseBuf = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    const nGain = ac.createGain();
    nGain.gain.setValueAtTime(0.16, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    noise.connect(nGain);
    nGain.connect(masterGainRef.current!);
    noise.start(now);

    setHumVolume(0);
  }, [ensureAudioContext, setHumVolume]);

  const toggleAudio = useCallback(() => {
    audioEnabledRef.current = !audioEnabledRef.current;
    if (audioEnabledRef.current) {
      ensureAudioContext();
      playClick(1080);
      setHumVolume(0.038);
    } else {
      setHumVolume(0);
    }
    return audioEnabledRef.current;
  }, [ensureAudioContext, playClick, setHumVolume]);

  const unlockAndBootOnce = useCallback(() => {
    if (!hasBootedRef.current && audioEnabledRef.current) {
      playBoot();
    }
  }, [playBoot]);

  // Toast
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), 2600);
  }, []);

  // Time formatting
  const formatTime = useCallback((totalSeconds: number) => {
    const hrs = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, '0');
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }, []);

  const addSystemLog = useCallback((source: string, msg: string) => {
    setState(prev => ({
      ...prev,
      systemLogs: [
        { time: formatTime(prev.elapsedSeconds), source, msg },
        ...prev.systemLogs.slice(0, 39)
      ]
    }));
  }, [formatTime]);

  const triggerBurst = useCallback((durationMs = 1800) => {
    setState(prev => ({ ...prev, burstUntil: performance.now() + durationMs }));
    setTimeout(() => {
      setState(prev => {
        if (performance.now() >= prev.burstUntil) {
          return { ...prev, burstUntil: 0 };
        }
        return prev;
      });
    }, durationMs + 60);
  }, []);

  const applyFocusVisuals = useCallback(() => {
    const shouldDim = state.focusMode || state.coreStatus === 'LISTENING';
    leftWingRef.current?.classList.toggle('focus-dimmed', shouldDim);
    rightWingRef.current?.classList.toggle('focus-dimmed', shouldDim);
  }, [state.focusMode, state.coreStatus]);

  const setCoreStatus = useCallback((newStatus: AppState['coreStatus']) => {
    setState(prev => {
      const updated = { ...prev };
      if (newStatus !== 'HALTED') {
        updated.previousStatus = newStatus;
      }
      updated.coreStatus = newStatus;
      return updated;
    });
    applyFocusVisuals();
    drawConstellationPaths();
  }, [applyFocusVisuals]);

  const openInspector = useCallback((title: string, subtitle: string, badgeColor: string, body: React.ReactNode) => {
    setInspectorContent({ title, subtitle, badgeColor, body });
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorContent(null);
    setState(prev => ({ ...prev, selectedNodeId: null }));
  }, []);

  // Canvas rendering - simplified for React
  const drawConstellationPaths = useCallback(() => {
    if (!pathsGroupRef.current || !pulsesGroupRef.current || !leftWingRef.current || !rightWingRef.current) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w * 0.5;
    const bustHeight = Math.min(h * 0.86, w * 0.62);
    const bustTopY = h * 0.13;
    const headHalfW = bustHeight * 0.185;
    const anchorY = bustTopY + bustHeight * 0.34;
    const leftAnchorX = cx - headHalfW * 1.06;
    const rightAnchorX = cx + headHalfW * 1.06;

    const isHalted = state.coreStatus === 'HALTED';
    const isBurst = performance.now() < state.burstUntil;

    let basePathsHtml = '';
    let pulsePathsHtml = '';

    const getBustWidth = (v: number) => {
      if (v < 0.16) {
        const t = v / 0.16;
        return Math.pow(1 - Math.pow(1 - t, 2.2), 0.50) * 0.98;
      }
      if (v < 0.25) return 0.98 + (1.0 - 0.98) * ((v - 0.16) / 0.09);
      if (v < 0.38) return 1.0 - 0.09 * ((v - 0.25) / 0.13);
      if (v < 0.50) return 0.91 - 0.26 * ((v - 0.38) / 0.12);
      if (v < 0.64) return 0.65 + 0.78 * Math.pow((v - 0.53) / 0.11, 1.35);
      return 1.43 + 1.18 * ((v - 0.64) / 0.14) + 0.54 * ((v - 0.74) / 0.18);
    };

    agents.forEach((a, idx) => {
      const el = document.getElementById(`node-circle-${a.id}`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const tx = rect.right + 4;
      const ty = rect.top + rect.height / 2;

      const dx = leftAnchorX - tx;
      const cp1x = leftAnchorX - dx * 0.46;
      const cp1y = anchorY + (ty - anchorY) * 0.08;
      const cp2x = tx + dx * 0.42;
      const cp2y = ty;

      const d = `M ${leftAnchorX.toFixed(1)} ${anchorY.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`;

      const strokeColor = isHalted
        ? 'rgba(239, 68, 68, 0.25)'
        : (a.active ? 'rgba(245, 158, 11, 0.58)' : 'rgba(148, 163, 184, 0.26)');

      basePathsHtml += `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${a.active && !isHalted ? '1.35' : '1'}" />`;

      if (a.active && !isHalted) {
        const delay = (idx * -0.45).toFixed(2);
        pulsePathsHtml += `<path d="${d}" class="svg-pulse-amber ${isBurst ? 'svg-pulse-burst' : ''}" style="animation-delay: ${delay}s" />`;
      }
    });

    resources.forEach((r, idx) => {
      const el = document.getElementById(`node-circle-${r.id}`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const tx = rect.left - 4;
      const ty = rect.top + rect.height / 2;

      const dx = tx - rightAnchorX;
      const cp1x = rightAnchorX + dx * 0.46;
      const cp1y = anchorY + (ty - anchorY) * 0.08;
      const cp2x = tx - dx * 0.42;
      const cp2y = ty;

      const d = `M ${rightAnchorX.toFixed(1)} ${anchorY.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)}`;

      const strokeColor = isHalted
        ? 'rgba(239, 68, 68, 0.22)'
        : 'rgba(56, 189, 248, 0.48)';

      basePathsHtml += `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="1.2" />`;

      if (!isHalted) {
        const delay = (idx * -0.55).toFixed(2);
        pulsePathsHtml += `<path d="${d}" class="svg-pulse-cyan ${isBurst ? 'svg-pulse-burst' : ''}" style="animation-delay: ${delay}s" />`;
      }
    });

    if (pathsGroupRef.current) pathsGroupRef.current.innerHTML = basePathsHtml;
    if (pulsesGroupRef.current) pulsesGroupRef.current.innerHTML = pulsePathsHtml;
  }, [state.coreStatus, state.burstUntil]);

  // Agent click handler
  const handleAgentClick = useCallback((id: string) => {
    const agent = agents.find(a => a.id === id);
    if (!agent) return;
    if (state.coreStatus !== 'HALTED') {
      agent.active = !agent.active;
      if (agent.active) playDispatch(); else playClick(620);
      addSystemLog(agent.name, agent.active ? 'Dispatched by Orchestrator' : 'Switched to standby');
      triggerBurst(1500);
      drawConstellationPaths();
    } else {
      playClick(320);
    }
    openAgentInspector(id);
  }, [state.coreStatus, playDispatch, playClick, addSystemLog, triggerBurst, drawConstellationPaths]);

  const openAgentInspector = useCallback((id: string) => {
    const agent = agents.find(a => a.id === id);
    if (!agent) return;
    setState(prev => ({ ...prev, selectedNodeId: id }));
    const isHalted = state.coreStatus === 'HALTED';
    const badgeColor = isHalted ? '#EF4444' : (agent.active ? '#F59E0B' : '#94A3B8');

    const body = (
      <div className="space-y-4">
        <div className="p-3.5 rounded-lg bg-[#050C17]/80 border border-[#38BDF8]/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Role</span>
            <span className={`font-mono-tech text-[10px] px-2 py-0.5 rounded ${agent.active && !isHalted ? 'bg-[#F59E0B]/20 text-[#FCD34D] border border-[#F59E0B]/40' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}>
              {isHalted ? 'HALTED' : (agent.active ? 'ACTIVE' : 'STANDBY')}
            </span>
          </div>
          <div className="text-sm text-white font-medium">{agent.role}</div>
          <p className="text-xs text-[#94A3B8] leading-relaxed">{agent.task}</p>
        </div>

        <div className="flex gap-2">
          <button
            id="insp-toggle-agent"
            className={`flex-1 py-2 px-3 rounded-lg font-mono-tech text-[11px] uppercase tracking-wider cursor-pointer transition-all ${
              agent.active
                ? 'bg-[#F59E0B]/20 border border-[#F59E0B]/50 text-[#FCD34D] hover:bg-[#F59E0B]/30'
                : 'bg-[#38BDF8]/15 border border-[#38BDF8]/40 text-[#7DD3FC] hover:bg-[#38BDF8]/25'
            }`}
            onClick={() => {
              if (state.coreStatus === 'HALTED') {
                showToast('System halted. Resume core first.');
                return;
              }
              agent.active = !agent.active;
              addSystemLog(agent.name, agent.active ? 'Activated via Inspector' : 'Placed on standby');
              triggerBurst(1200);
              drawConstellationPaths();
              openAgentInspector(id);
            }}
          >
            {agent.active ? 'Pause Agent' : 'Activate Agent'}
          </button>
          <button
            id="insp-pulse-agent"
            className="py-2 px-3 rounded-lg font-mono-tech text-[11px] uppercase tracking-wider bg-[#0A1829] border border-[#38BDF8]/30 text-[#E0F2FE] hover:border-[#38BDF8] cursor-pointer"
            onClick={() => {
              if (!agent.active && state.coreStatus !== 'HALTED') agent.active = true;
              agent.logs.unshift(`Heartbeat verified [${formatTime(state.elapsedSeconds)}]`);
              addSystemLog(agent.name, 'Neural link ping acknowledged (4ms)');
              triggerBurst(1600);
              drawConstellationPaths();
              openAgentInspector(id);
              showToast(`Pulse dispatched to ${agent.name}`);
            }}
          >
            Ping
          </button>
        </div>

        <div className="space-y-2">
          <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Agent Execution Trace</div>
          <div className="space-y-1.5 font-mono-tech text-[11px]">
            {agent.logs.map((line, i) => (
              <div key={i} className="p-2.5 rounded bg-[#050C17]/75 border border-[#38BDF8]/15 text-[#CBD5E1]">
                <span className="text-[#F59E0B] mr-1.5">{'>'}</span>{line}
              </div>
            ))}
          </div>
        </div>
      </div>
    );

    openInspector(agent.name, 'SPECIALIST AGENT NODE', badgeColor, body);
  }, [state.coreStatus, state.elapsedSeconds, formatTime, addSystemLog, triggerBurst, drawConstellationPaths, openInspector, showToast]);

  const openResourceInspector = useCallback((id: string) => {
    const res = resources.find(r => r.id === id);
    if (!res) return;
    setState(prev => ({ ...prev, selectedNodeId: id }));

    let extraContent: React.ReactNode = null;
    if (res.type === 'memory' || res.type === 'context') {
      extraContent = (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Retrieved Context Keys</span>
            <button
              id="insp-flush-mem"
              className="font-mono-tech text-[10px] uppercase px-2 py-1 rounded border border-[#EF4444]/50 text-[#FCA5A5] hover:bg-[#EF4444]/20 cursor-pointer"
              onClick={() => {
                const ctxRes = resources.find(r => r.id === 'context');
                if (ctxRes) ctxRes.pct = 12;
                addSystemLog('SQLite Memory', 'Flushed ephemeral context window (100% -> 12%)');
                triggerBurst(1200);
                drawConstellationPaths();
                openResourceInspector(id);
                showToast('Context window flushed');
              }}
            >
              Flush Context
            </button>
          </div>
          <div className="space-y-1.5">
            {state.memoryEntries.map((m, i) => (
              <div key={i} className="p-2.5 rounded bg-[#050C17]/80 border border-[#38BDF8]/15">
                <div className="flex items-center justify-between font-mono-tech text-[10px]">
                  <span className="text-[#7DD3FC]">{m.key}</span>
                  <span className="text-[#F59E0B]">sim {m.score}</span>
                </div>
                <div className="text-[11px] text-[#E2E8F0] mt-1">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      );
    } else if (res.type === 'mcp') {
      extraContent = (
        <div className="space-y-2">
          <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Connected MCP Servers</div>
          <div className="space-y-2">
            {state.mcpServers.map((s, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded bg-[#050C17]/80 border border-[#38BDF8]/15">
                <div>
                  <div className="text-xs text-white">{s.name}</div>
                  <div className="font-mono-tech text-[10px] text-[#7DD3FC]/60">Latency: {s.latency}</div>
                </div>
                <button
                  data-mcp-toggle={s.id}
                  className={`font-mono-tech text-[10px] px-2.5 py-1 rounded cursor-pointer border ${
                    s.enabled
                      ? 'bg-[#38BDF8]/20 border-[#38BDF8] text-[#E0F2FE]'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                  onClick={() => {
                    const srv = state.mcpServers.find(s => s.id === s.id);
                    if (!srv) return;
                    srv.enabled = !srv.enabled;
                    const enabledCount = state.mcpServers.filter(s => s.enabled).length;
                    const mcpRes = resources.find(r => r.id === 'mcp');
                    if (mcpRes) mcpRes.pct = Math.round((enabledCount / state.mcpServers.length) * 20);
                    addSystemLog('MCP Servers', `${srv.name} ${srv.enabled ? 'enabled' : 'disabled'}`);
                    drawConstellationPaths();
                    openResourceInspector(id);
                  }}
                >
                  {s.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    } else {
      extraContent = (
        <div className="p-3 rounded-lg bg-[#050C17]/75 border border-[#38BDF8]/15 font-mono-tech text-[11px] text-[#CBD5E1] space-y-1.5">
          <div className="flex justify-between"><span className="text-[#7DD3FC]/70">STATUS</span><span className="text-[#10B981]">NOMINAL</span></div>
          <div className="flex justify-between"><span className="text-[#7DD3FC]/70">LOAD</span><span>{res.pct}%</span></div>
          <div className="flex justify-between"><span className="text-[#7DD3FC]/70">SYNC</span><span>REALTIME IPC</span></div>
        </div>
      );
    }

    const body = (
      <div className="space-y-2.5">
        <div className="p-3.5 rounded-lg bg-[#050C17]/80 border border-[#38BDF8]/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#E2E8F0]">{res.desc}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-[#38BDF8]/15 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#0EA5E9] to-[#7DD3FC]" style={{ width: `${res.pct}%` }}></div>
            </div>
            <span className="font-mono-tech text-xs text-[#7DD3FC]">{res.pct}%</span>
          </div>
        </div>
        {extraContent}
      </div>
    );

    openInspector(res.name, 'SYSTEM RESOURCE NODE', '#38BDF8', body);
  }, [state.mcpServers, state.memoryEntries, addSystemLog, triggerBurst, drawConstellationPaths, openInspector, showToast]);

  const openTerminalInspector = useCallback(() => {
    const body = (
      <div className="space-y-2 font-mono-tech text-[11px]">
        <div className="text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Live Orchestrator Event Stream</div>
        {state.systemLogs.map((log, i) => (
          <div key={i} className="p-2.5 rounded bg-[#050C17]/80 border border-[#38BDF8]/15 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#F59E0B]">{log.source}</span>
              <span className="text-[#7DD3FC]/50">{log.time}</span>
            </div>
            <div className="text-[#E2E8F0]">{log.msg}</div>
          </div>
        ))}
      </div>
    );
    openInspector('Live Execution Log', 'SYSTEM TELEMETRY STREAM', '#38BDF8', body);
  }, [state.systemLogs, openInspector]);

  const openSettingsInspector = useCallback(() => {
    const body = (
      <div className="space-y-4">
        <div className="p-3.5 rounded-lg bg-[#050C17]/80 border border-[#38BDF8]/20 space-y-2">
          <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Quick Simulation</div>
          <p className="text-xs text-[#94A3B8]">Fire a live multi-agent dispatch pulse to verify visual links and telemetry.</p>
          <button
            id="btn-sim-dispatch"
            className="w-full py-2 px-3 rounded-lg font-mono-tech text-xs uppercase tracking-wider bg-[#F59E0B]/20 border border-[#F59E0B]/60 text-[#FCD34D] hover:bg-[#F59E0B]/30 cursor-pointer"
            onClick={() => {
              if (state.coreStatus === 'HALTED') setCoreStatus('THINKING');
              const coder = agents.find(a => a.id === 'coder');
              if (coder) coder.active = true;
              addSystemLog('Orchestrator', 'Dispatched live test pulse -> Coder & SQLite Memory');
              triggerBurst(2200);
              drawConstellationPaths();
              showToast('Dispatch pulse fired to Coder & SQLite Memory');
            }}
          >
            Trigger Agent Dispatch Pulse
          </button>
        </div>
        <div className="space-y-2">
          <div className="font-mono-tech text-[10px] uppercase tracking-wider text-[#7DD3FC]/70">Core Shortcuts</div>
          <div className="p-3 rounded-lg bg-[#050C17]/80 border border-[#38BDF8]/15 font-mono-tech text-[11px] space-y-1.5 text-[#CBD5E1]">
            <div className="flex justify-between"><span>Voice Listening</span><span className="text-[#7DD3FC]">Ctrl + Space</span></div>
            <div className="flex justify-between"><span>Close Drawer</span><span className="text-[#7DD3FC]">Escape</span></div>
            <div className="flex justify-between"><span>Target Agent</span><span className="text-[#F59E0B]">@Coder / @Designer</span></div>
          </div>
        </div>
      </div>
    );
    openInspector('Core & MCP Settings', 'APEX SYSTEM CONFIG', '#38BDF8', body);
  }, [state.coreStatus, setCoreStatus, addSystemLog, triggerBurst, drawConstellationPaths, openInspector, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        if (state.coreStatus !== 'HALTED') {
          const next = state.coreStatus === 'LISTENING' ? 'THINKING' : 'LISTENING';
          playVoice(next === 'LISTENING');
          setCoreStatus(next);
          addSystemLog('Voice Engine', next === 'LISTENING' ? 'Microphone active (Whisper Flow)' : 'Voice input closed');
          showToast(next === 'LISTENING' ? 'Listening... (Ctrl+Space to stop)' : 'Voice dictation stopped');
        }
      } else if (e.key === 'Escape') {
        closeInspector();
      } else if (e.key === 'Escape' && request) {
        onRespond(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.coreStatus, request, onRespond, playVoice, setCoreStatus, addSystemLog, showToast, closeInspector]);

  // Audio unlock on first gesture
  useEffect(() => {
    const unlock = () => {
      unlockAndBootOnce();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [unlockAndBootOnce]);

  // HUD Clock
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        if (prev.coreStatus !== 'HALTED') {
          return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let W = 0, H = 0, DPR = 1;
    let seedVal = 4219;
    const organicVeins: any[] = [];
    const sandParticles: any[] = [];
    const ambientDust: any[] = [];
    let globalDisperseTarget = 0;
    let globalDisperse = 0.85;

    const seededRand = () => {
      seedVal = (seedVal * 16807) % 2147483647;
      return (seedVal - 1) / 2147483646;
    };

    const getBustWidth = (v: number) => {
      if (v < 0.16) {
        const t = v / 0.16;
        return Math.pow(1 - Math.pow(1 - t, 2.2), 0.50) * 0.98;
      }
      if (v < 0.25) return 0.98 + (1.0 - 0.98) * ((v - 0.16) / 0.09);
      if (v < 0.38) return 1.0 - 0.09 * ((v - 0.25) / 0.13);
      if (v < 0.50) return 0.91 - 0.26 * ((v - 0.38) / 0.12);
      if (v < 0.64) return 0.65 + 0.78 * Math.pow((v - 0.53) / 0.11, 1.35);
      return 1.43 + 1.18 * ((v - 0.64) / 0.14) + 0.54 * ((v - 0.74) / 0.18);
    };

    const addRootBranch = (x0: number, v0: number, angle: number, length: number, depth: number, thickness: number, isAmber: boolean, sideSign: number) => {
      if (depth <= 0 || length < 0.025) return;
      const steps = 10;
      const pts = [{ x: x0, v: v0 }];
      let cx = x0, cv = v0, curAngle = angle;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        curAngle += (seededRand() - 0.5) * 0.34;
        const stepLen = length / steps;
        let nx = cx + Math.cos(curAngle) * stepLen * 1.55;
        let nv = cv + Math.sin(curAngle) * stepLen;
        nv = Math.max(0.015, Math.min(0.99, nv));
        const maxW = getBustWidth(nv) * 0.97;
        if (Math.abs(nx) > maxW) {
          nx = Math.sign(nx) * maxW;
          curAngle = nv > 0.5 ? -Math.PI * 0.5 + sideSign * 0.25 : -Math.PI * 0.5 - sideSign * 0.22;
        }
        pts.push({ x: nx, v: nv });
        cx = nx; cv = nv;
        if (i === 5 && depth > 1) {
          const forkAngle = curAngle + (seededRand() > 0.5 ? 1 : -1) * (0.35 + seededRand() * 0.32);
          addRootBranch(cx, cv, forkAngle, length * 0.62, depth - 1, thickness * 0.68, isAmber || (nv < 0.45 && Math.abs(cx) < 0.45), sideSign);
        }
      }
      organicVeins.push({ pts, thickness, isAmber, phase: seededRand() * Math.PI * 2, sparkSpeed: 0.35 + seededRand() * 0.65 });
      if (depth > 1) {
        addRootBranch(cx, cv, curAngle - (0.22 + seededRand() * 0.22), length * 0.72, depth - 1, thickness * 0.72, isAmber, sideSign);
        addRootBranch(cx, cv, curAngle + (0.22 + seededRand() * 0.22), length * 0.68, depth - 1, thickness * 0.66, isAmber, sideSign);
      }
    };

    const buildOrganicVeinSkeleton = () => {
      organicVeins.length = 0;
      const trunkSeeds = [
        { x: 0.0, v: 0.98, ang: -Math.PI / 2, len: 0.24, d: 4, w: 2.2, amber: true },
        { x: -0.22, v: 0.98, ang: -Math.PI / 2 + 0.08, len: 0.23, d: 4, w: 1.9, amber: true },
        { x: 0.22, v: 0.98, ang: -Math.PI / 2 - 0.08, len: 0.23, d: 4, w: 1.9, amber: true },
        { x: -0.58, v: 0.96, ang: -Math.PI / 2 + 0.22, len: 0.25, d: 4, w: 1.85, amber: false },
        { x: 0.58, v: 0.96, ang: -Math.PI / 2 - 0.22, len: 0.25, d: 4, w: 1.85, amber: false },
        { x: -1.25, v: 0.97, ang: -Math.PI / 2 + 0.42, len: 0.24, d: 3, w: 1.7, amber: false },
        { x: 1.25, v: 0.97, ang: -Math.PI / 2 - 0.42, len: 0.24, d: 3, w: 1.7, amber: false },
        { x: -2.05, v: 0.96, ang: -Math.PI / 2 + 0.56, len: 0.22, d: 3, w: 1.5, amber: false },
        { x: 2.05, v: 0.96, ang: -Math.PI / 2 - 0.56, len: 0.22, d: 3, w: 1.5, amber: false },
        { x: -0.78, v: 0.44, ang: -Math.PI / 2 - 0.12, len: 0.19, d: 4, w: 1.65, amber: false },
        { x: 0.78, v: 0.44, ang: -Math.PI / 2 + 0.12, len: 0.19, d: 4, w: 1.65, amber: false },
        { x: -0.42, v: 0.49, ang: -Math.PI / 2 + 0.05, len: 0.18, d: 3, w: 1.5, amber: true },
        { x: 0.42, v: 0.49, ang: -Math.PI / 2 - 0.05, len: 0.18, d: 3, w: 1.5, amber: true },
        { x: -0.82, v: 0.24, ang: -Math.PI / 2 + 0.35, len: 0.15, d: 3, w: 1.4, amber: false },
        { x: 0.82, v: 0.24, ang: -Math.PI / 2 - 0.35, len: 0.15, d: 3, w: 1.4, amber: false }
      ];
      trunkSeeds.forEach(s => addRootBranch(s.x, s.v, s.ang, s.len, s.d, s.w, s.amber, s.x < 0 ? -1 : 1));
      [-1, 1].forEach(side => {
        for (let strand = 0; strand < 3; strand++) {
          const pts = [];
          const inset = 1.0 - strand * 0.045;
          for (let i = 0; i <= 48; i++) {
            const v = i / 48;
            const organicJitter = Math.sin(v * 26 + strand * 2.1) * 0.025;
            const x = side * getBustWidth(v) * (inset + organicJitter);
            pts.push({ x, v });
          }
          organicVeins.push({ pts, thickness: strand === 0 ? 1.85 : 1.05, isAmber: false, phase: strand * 1.4, sparkSpeed: 0.48 + strand * 0.15 });
        }
      });
    };

    const initSandParticles = () => {
      sandParticles.length = 0;
      for (let i = 0; i < 1550; i++) {
        const v = Math.pow(Math.random(), 0.92) * 0.985;
        const maxW = getBustWidth(v);
        const rimBias = Math.random();
        let nx;
        if (rimBias < 0.42) {
          const side = Math.random() < 0.5 ? -1 : 1;
          nx = side * maxW * (0.84 + Math.random() * 0.19);
        } else if (rimBias < 0.72) {
          nx = (Math.random() * 2 - 1) * maxW * 0.88;
        } else {
          nx = (Math.random() - 0.5) * maxW * 0.65;
        }
        const outAngle = Math.atan2(v - 0.34, nx) + (Math.random() - 0.5) * 0.9;
        const launchSpeed = 0.35 + Math.random() * 1.15;
        sandParticles.push({
          hx: nx, hv: v, cyclePos: Math.random(), cycleSpeed: 0.14 + Math.random() * 0.34,
          isLauncher: Math.random() < 0.58, vx: Math.cos(outAngle) * launchSpeed,
          vy: Math.sin(outAngle) * launchSpeed - 0.22, size: 0.8 + Math.random() * 1.65,
          twinklePhase: Math.random() * Math.PI * 2, twinkleFreq: 4 + Math.random() * 10,
          isAmber: (v > 0.18 && v < 0.42 && Math.abs(nx) < 0.55) || (Math.abs(nx) < 0.25 && v > 0.48 && Math.random() < 0.55) || Math.random() < 0.16
        });
      }
    };

    const initAmbientDust = () => {
      ambientDust.length = 0;
      for (let i = 0; i < 240; i++) {
        ambientDust.push({
          x: Math.random(), y: 0.38 + Math.random() * 0.54, size: 0.7 + Math.random() * 1.5,
          phase: Math.random() * Math.PI * 2, speed: 0.015 + Math.random() * 0.04, amber: Math.random() < 0.38
        });
      }
    };

    const resizeCanvas = () => {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      drawConstellationPaths();
    };

    const drawParticleTerrain = (time: number, speedMult: number, halted: boolean) => {
      const rows = 30, cols = 104;
      const baseY = H * 0.55, spreadY = H * 0.24;
      for (let r = 0; r < rows; r++) {
        const depth = r / (rows - 1);
        const persp = 0.52 + depth * 1.02;
        const rowY = baseY + (depth - 0.36) * spreadY;
        const rowAlpha = Math.sin(depth * Math.PI) * 0.85;
        for (let c = 0; c < cols; c++) {
          const u = c / (cols - 1);
          const nx = (u - 0.5) * 2;
          const x = u * W;
          const wave1 = Math.sin(nx * 5.6 + time * 0.5 * speedMult + depth * 4.2) * 28;
          const wave2 = Math.cos(nx * 11.4 - time * 0.38 * speedMult + depth * 6.4) * 14;
          const centerValley = 0.24 + 0.76 * Math.min(1, Math.abs(nx) * 1.4);
          const elevation = (wave1 + wave2) * centerValley * persp;
          const y = rowY - elevation;
          const amberVein = Math.sin(nx * 6.8 - depth * 4.8 + time * 0.34 * speedMult);
          const isAmber = !halted && amberVein > 0.65 && depth > 0.24;
          const dotSize = (0.8 + depth * 1.25) * (isAmber ? 1.35 : 1);
          if (halted) ctx.fillStyle = `rgba(239, 68, 68, ${(rowAlpha * 0.28).toFixed(3)})`;
          else if (isAmber) ctx.fillStyle = `rgba(255, 185, 42, ${(rowAlpha * 0.92).toFixed(3)})`;
          else {
            const bright = elevation > 12 ? 0.94 : 0.45;
            ctx.fillStyle = `rgba(56, 189, 248, ${(rowAlpha * bright).toFixed(3)})`;
          }
          ctx.fillRect(x - dotSize * 0.5, y - dotSize * 0.5, dotSize, dotSize);
        }
      }
      for (let i = 0; i < ambientDust.length; i++) {
        const d = ambientDust[i];
        const life = (time * d.speed * speedMult * 6 + d.phase) % 1;
        const alpha = Math.sin(life * Math.PI) * (halted ? 0.28 : 0.85);
        if (alpha <= 0.02) continue;
        const px = ((d.x + time * d.speed * 0.4) % 1) * W;
        const py = d.y * H - life * 26;
        ctx.fillStyle = halted ? `rgba(239, 68, 68, ${alpha.toFixed(3)})` : (d.amber ? `rgba(255, 195, 55, ${alpha.toFixed(3)})` : `rgba(125, 211, 252, ${alpha.toFixed(3)})`);
        ctx.fillRect(px, py, d.size, d.size);
      }
    };

    const drawSentientCore = (time: number, speedMult: number, halted: boolean, listening: boolean, thinking: boolean) => {
      globalDisperse += (globalDisperseTarget - globalDisperse) * (halted ? 0.045 : 0.065);
      const cx = W * 0.5;
      const bustHeight = Math.min(H * 0.86, W * 0.62);
      const bustTopY = H * 0.13;
      const headHalfW = bustHeight * 0.185;
      const eyeY = bustTopY + bustHeight * 0.275;
      const eyeOffsetX = headHalfW * 0.34;
      const breath = Math.sin(time * (thinking ? 2.8 : listening ? 5.2 : 1.5));
      const fastFlicker = 0.84 + 0.16 * Math.sin(time * 24.0) * Math.cos(time * 13.7);
      const surge = (performance.now() < state.burstUntil) ? 1.42 : 1.0;
      const audioPulse = listening ? (0.5 + 0.5 * Math.sin(time * 11.5) * Math.cos(time * 4.3)) : 0;
      const integrity = Math.max(0, 1 - globalDisperse * 1.15);

      if (integrity > 0.08) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= 64; i++) {
          const v = i / 64;
          const x = cx + getBustWidth(v) * headHalfW * 1.01;
          const y = bustTopY + v * bustHeight;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = 64; i >= 0; i--) {
          const v = i / 64;
          const x = cx - getBustWidth(v) * headHalfW * 1.01;
          const y = bustTopY + v * bustHeight;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(2, 8, 18, ${(0.86 * integrity).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      }

      const auraColor = halted ? '239, 68, 68' : '0, 229, 255';
      const haloPulse = (0.28 + 0.08 * breath) * fastFlicker * surge * (0.25 + 0.75 * integrity);
      const auraGrad = ctx.createRadialGradient(cx, eyeY + headHalfW * 0.15, headHalfW * 0.25, cx, eyeY + headHalfW * 0.15, headHalfW * 2.6);
      auraGrad.addColorStop(0, `rgba(${auraColor}, ${Math.min(0.6, haloPulse).toFixed(3)})`);
      auraGrad.addColorStop(0.5, `rgba(${auraColor}, ${(haloPulse * 0.28).toFixed(3)})`);
      auraGrad.addColorStop(1, `rgba(${auraColor}, 0)`);
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, eyeY + headHalfW * 0.15, headHalfW * 2.6, 0, Math.PI * 2);
      ctx.fill();

      if (integrity > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < organicVeins.length; i++) {
          const vein = organicVeins[i];
          const pts = vein.pts;
          const pulse = 0.68 + 0.32 * Math.sin(time * 2.4 * speedMult + vein.phase);
          const alpha = (vein.isAmber ? 0.72 : 0.56) * pulse * integrity * fastFlicker;
          ctx.beginPath();
          for (let j = 0; j < pts.length; j++) {
            const p = pts[j];
            const sway = Math.sin(time * 1.4 * speedMult + p.v * 9 + vein.phase) * (listening ? 2.4 : 0.85);
            const px = cx + p.x * headHalfW + sway;
            const py = bustTopY + p.v * bustHeight;
            if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          if (halted) ctx.strokeStyle = `rgba(239, 68, 68, ${(alpha * 0.65).toFixed(3)})`;
          else if (vein.isAmber) ctx.strokeStyle = `rgba(255, 175, 32, ${Math.min(0.95, alpha * surge).toFixed(3)})`;
          else ctx.strokeStyle = `rgba(34, 211, 238, ${Math.min(0.9, alpha * surge).toFixed(3)})`;
          ctx.lineWidth = vein.thickness;
          ctx.stroke();
          if (!halted && i % 2 === 0 && pts.length > 2) {
            const sparkT = (time * vein.sparkSpeed * speedMult + vein.phase) % 1;
            const idxF = sparkT * (pts.length - 1);
            const i0 = Math.floor(idxF);
            const i1 = Math.min(pts.length - 1, i0 + 1);
            const f = idxF - i0;
            const sx = cx + (pts[i0].x + (pts[i1].x - pts[i0].x) * f) * headHalfW;
            const sy = bustTopY + (pts[i0].v + (pts[i1].v - pts[i0].v) * f) * bustHeight;
            const sparkAlpha = Math.sin(sparkT * Math.PI) * integrity;
            ctx.fillStyle = vein.isAmber ? `rgba(255, 250, 210, ${sparkAlpha.toFixed(3)})` : `rgba(224, 252, 255, ${sparkAlpha.toFixed(3)})`;
            ctx.fillRect(sx - 1.3, sy - 1.3, 2.6, 2.6);
          }
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const scatterRadius = headHalfW * 2.8;
      for (let i = 0; i < sandParticles.length; i++) {
        const p = sandParticles[i];
        const cycle = (p.cyclePos + time * p.cycleSpeed * speedMult) % 1;
        let launchDist = 0, lifeAlpha = 1;
        if (p.isLauncher && !halted) {
          if (cycle > 0.42) {
            const t = (cycle - 0.42) / 0.58;
            launchDist = Math.pow(t, 1.65) * headHalfW * (0.85 + (surge - 1) * 1.4);
            lifeAlpha = Math.max(0, 1 - Math.pow(t, 1.35));
          } else {
            lifeAlpha = Math.min(1, cycle / 0.08);
          }
        } else {
          lifeAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * p.twinkleFreq + p.twinklePhase));
        }
        const totalDisp = launchDist + globalDisperse * scatterRadius * (0.4 + p.cyclePos * 0.9);
        const swirlAngle = globalDisperse * 2.4 * (p.hx < 0 ? -1 : 1);
        const cosS = Math.cos(swirlAngle), sinS = Math.sin(swirlAngle);
        const baseX = p.hx * headHalfW, baseY = (p.hv - 0.34) * bustHeight;
        const rx = baseX * cosS - baseY * sinS, ry = baseX * sinS + baseY * cosS;
        const px = cx + rx + p.vx * totalDisp;
        const py = bustTopY + 0.34 * bustHeight + ry + p.vy * totalDisp;
        const twinkle = 0.65 + 0.35 * Math.sin(time * p.twinkleFreq + p.twinklePhase);
        const finalAlpha = lifeAlpha * twinkle * (halted ? Math.max(0.05, 1 - globalDisperse * 0.85) : 1);
        if (finalAlpha <= 0.04) continue;
        if (halted) ctx.fillStyle = `rgba(239, 68, 68, ${(finalAlpha * 0.75).toFixed(3)})`;
        else if (p.isAmber) ctx.fillStyle = `rgba(255, 200, 75, ${Math.min(1, finalAlpha * 0.95).toFixed(3)})`;
        else ctx.fillStyle = `rgba(110, 235, 255, ${Math.min(1, finalAlpha * 0.92).toFixed(3)})`;
        const sz = p.size * (launchDist > 4 ? 0.85 : 1.0);
        ctx.fillRect(px - sz * 0.5, py - sz * 0.5, sz, sz);
      }
      ctx.restore();

      if (integrity > 0.15) {
        const eyeIntensity = (halted ? 0.55 : (thinking ? 1.15 : listening ? (1.05 + audioPulse * 0.45) : 0.92)) * fastFlicker * surge * integrity;
        const eyeW = headHalfW * 0.21, eyeH = headHalfW * 0.068;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        [-1, 1].forEach(side => {
          const ex = cx + side * eyeOffsetX;
          const bloomR = headHalfW * (0.52 + breath * 0.05 + audioPulse * 0.1) * surge;
          const g = ctx.createRadialGradient(ex, eyeY, 1, ex, eyeY, bloomR);
          if (halted) {
            g.addColorStop(0, 'rgba(255, 220, 220, 0.9)');
            g.addColorStop(0.25, 'rgba(239, 68, 68, 0.8)');
            g.addColorStop(1, 'rgba(239, 68, 68, 0)');
          } else {
            g.addColorStop(0, 'rgba(255, 255, 235, 1.0)');
            g.addColorStop(0.18, `rgba(255, 210, 65, ${Math.min(1, 0.96 * eyeIntensity).toFixed(3)})`);
            g.addColorStop(0.45, `rgba(245, 130, 0, ${Math.min(1, 0.55 * eyeIntensity).toFixed(3)})`);
            g.addColorStop(1, 'rgba(217, 95, 2, 0)');
          }
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ex, eyeY, bloomR, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = halted ? '#FEE2E2' : '#FFFBEB';
          ctx.beginPath();
          ctx.moveTo(ex - side * eyeW * 0.95, eyeY + eyeH * 0.35);
          ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.15, ex + side * eyeW, eyeY - eyeH * 0.45);
          ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.05, ex - side * eyeW * 0.95, eyeY + eyeH * 0.35);
          ctx.closePath();
          ctx.fill();
        });
        const flareW = headHalfW * (3.0 + breath * 0.35 + audioPulse * 0.65) * surge;
        const flareH = Math.max(2.4, headHalfW * 0.052);
        const flareGrad = ctx.createLinearGradient(cx - flareW, eyeY, cx + flareW, eyeY);
        if (halted) {
          flareGrad.addColorStop(0, 'rgba(239, 68, 68, 0)');
          flareGrad.addColorStop(0.5, 'rgba(255, 235, 235, 0.9)');
          flareGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        } else {
          flareGrad.addColorStop(0, 'rgba(255, 160, 0, 0)');
          flareGrad.addColorStop(0.25, 'rgba(255, 180, 35, 0.62)');
          flareGrad.addColorStop(0.5, 'rgba(255, 255, 235, 1.0)');
          flareGrad.addColorStop(0.75, 'rgba(255, 180, 35, 0.62)');
          flareGrad.addColorStop(1, 'rgba(255, 160, 0, 0)');
        }
        ctx.fillStyle = flareGrad;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, flareW, flareH, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!halted && (listening || thinking || surge > 1)) {
          const ringCount = listening ? 3 : 2;
          for (let k = 0; k < ringCount; k++) {
            const p = ((time * (listening ? 1.15 : 0.48) + k / ringCount) % 1);
            const r = headHalfW * (0.4 + p * 1.75);
            const alpha = (1 - p) * (listening ? 0.65 : 0.26) * surge * integrity;
            ctx.strokeStyle = `rgba(255, 195, 65, ${Math.min(0.85, alpha).toFixed(3)})`;
            ctx.lineWidth = listening ? 1.8 : 1.15;
            ctx.beginPath();
            ctx.arc(cx, eyeY, r, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    };

    const animate = (now: number) => {
      const time = now * 0.001;
      const halted = state.coreStatus === 'HALTED';
      const listening = state.coreStatus === 'LISTENING';
      const thinking = state.coreStatus === 'THINKING';
      const burstActive = now < state.burstUntil;
      const speedMult = halted ? 0.12 : (burstActive ? 1.85 : (thinking ? 1.25 : listening ? 1.55 : 0.68));
      const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.46, 20, W * 0.5, H * 0.5, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, halted ? '#1A070B' : '#07192E');
      bgGrad.addColorStop(0.52, '#030A15');
      bgGrad.addColorStop(1, '#02060D');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
      drawParticleTerrain(time, speedMult, halted);
      drawSentientCore(time, speedMult, halted, listening, thinking);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    buildOrganicVeinSkeleton();
    initSandParticles();
    initAmbientDust();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [state.coreStatus, state.burstUntil, drawConstellationPaths]);

  // Render wings
  useEffect(() => {
    if (!leftWingRef.current || !rightWingRef.current) return;
    const isCompact = window.innerWidth < 960 || window.innerHeight < 560;
    const leftArcOffsets = isCompact ? [10, 4, 0, 0, 4, 10] : [28, 10, 0, 0, 10, 28];
    const rightArcOffsets = isCompact ? [-10, -4, 0, 0, -4, -10] : [-28, -10, 0, 0, -10, -28];
    const isHalted = state.coreStatus === 'HALTED';

    leftWingRef.current.innerHTML = agents.map((a, i) => {
      const circleClass = isHalted ? 'node-halted' : (a.active ? 'node-agent-active' : 'node-agent-idle');
      const marginRight = leftArcOffsets[i] || 0;
      return `
        <div class="flex items-center justify-end gap-2.5 sm:gap-3.5 group cursor-pointer" style="transform: translateX(${marginRight}px)" data-agent-id="${a.id}">
          <span class="node-label text-xs sm:text-sm font-normal tracking-wide transition-colors ${a.active && !isHalted ? 'text-[#F8FAFC]' : 'text-[#94A3B8] group-hover:text-[#E2E8F0]'} whitespace-nowrap">${a.name}</span>
          <div id="node-circle-${a.id}" class="node-circle ${circleClass}">${a.icon}</div>
        </div>
      `;
    }).join('');

    rightWingRef.current.innerHTML = resources.map((r, i) => {
      const marginLeft = rightArcOffsets[i] || 0;
      return `
        <div class="flex items-center justify-start gap-2.5 sm:gap-3.5 group cursor-pointer" style="transform: translateX(${marginLeft}px)" data-resource-id="${r.id}">
          <div id="node-circle-${r.id}" class="node-circle ${isHalted ? 'node-halted' : 'node-resource'}">${r.icon}</div>
          <div class="flex flex-col">
            <span class="node-label text-xs sm:text-sm font-normal tracking-wide text-[#F1F5F9] group-hover:text-white whitespace-nowrap">${r.name}</span>
            <div class="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
              <div class="res-bar-track"><div class="res-bar-fill" style="width: ${r.pct}%"></div></div>
              <span class="res-pct font-mono-tech text-[10px] text-[#7DD3FC]/80 w-7">${r.pct}%</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    leftWingRef.current.querySelectorAll('[data-agent-id]').forEach(el => {
      el.addEventListener('mouseenter', () => playHover());
      el.addEventListener('click', () => handleAgentClick(el.getAttribute('data-agent-id')!));
    });
    rightWingRef.current.querySelectorAll('[data-resource-id]').forEach(el => {
      el.addEventListener('mouseenter', () => playHover());
      el.addEventListener('click', () => { playClick(860); openResourceInspector(el.getAttribute('data-resource-id')!); });
    });

    drawConstellationPaths();
  }, [state.coreStatus, playHover, playClick, handleAgentClick, openResourceInspector, drawConstellationPaths]);

  if (!request) return null;

  const { action } = request;
  const risk = action.risk === 'dangerous' ? 'risk-high' : action.risk === 'review' ? 'risk-medium' : 'risk-low';

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center" onClick={() => onRespond(false)}>
      <div className="modal-content w-full h-full max-w-[1400px] max-h-[900px] relative" onClick={(e) => e.stopPropagation()}>
        {/* Canvas Background */}
        <canvas
          ref={canvasRef}
          id="core-canvas"
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* SVG Constellation Layer */}
        <svg id="constellation-svg" className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="glow-amber" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="glow-cyan" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g ref={pathsGroupRef} id="constellation-paths" />
          <g ref={pulsesGroupRef} id="constellation-pulses" />
        </svg>

        {/* Main HUD */}
        <div id="hud-root" className="relative z-10 w-full h-full flex flex-col justify-between p-4 sm:p-6 md:p-8 pointer-events-none">
          {/* Top HUD */}
          <header className="relative w-full flex items-center justify-between shrink-0 pointer-events-auto z-30">
            <div className="flex flex-col select-none">
              <div id="hud-clock" className="font-mono-tech text-xl sm:text-3xl md:text-[34px] font-medium tracking-[0.08em] text-[#7DD3FC] leading-none drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]">
                {formatTime(state.elapsedSeconds)}
              </div>
              <button
                id="status-toggle"
                title="Click to cycle core state (THINKING / LISTENING / IDLE)"
                className="mt-1 text-left font-mono-tech text-[10px] sm:text-xs tracking-[0.16em] uppercase text-[#7DD3FC]/80 hover:text-white transition-colors flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  const order = ['THINKING', 'LISTENING', 'IDLE'] as const;
                  const nextIdx = (order.indexOf(state.coreStatus) + 1) % order.length;
                  playClick(980);
                  setCoreStatus(order[nextIdx]);
                  addSystemLog('Sentient Core', `Core mode switched to ${order[nextIdx]}`);
                }}
              >
                <span id="status-dot" className={`w-2 h-2 rounded-full shadow-[0_0_8px_#F59E0B] ${
                  state.coreStatus === 'THINKING' ? 'bg-[#F59E0B]' :
                  state.coreStatus === 'LISTENING' ? 'bg-[#22D3EE] animate-pulse' :
                  state.coreStatus === 'IDLE' ? 'bg-[#38BDF8]' : 'bg-[#EF4444]'
                }`}></span>
                <span id="status-label">STATUS: {state.coreStatus}</span>
              </button>
            </div>

            <h1 id="hud-title" className="hidden sm:block text-lg md:text-2xl font-light tracking-[0.14em] text-[#E0F2FE] drop-shadow-[0_0_14px_rgba(56,189,248,0.45)]">
              Orchestrator / Sentient Core
            </h1>

            <div className="flex items-center gap-1.5 sm:gap-2 font-mono-tech text-[10px] md:text-[11px] text-[#7DD3FC]/85">
              <button
                id="btn-audio-toggle"
                title="Toggle Tactical Sound Effects"
                className="px-2 sm:px-2.5 py-1 rounded-md border border-[#38BDF8]/40 bg-[#0A1423]/80 hover:border-[#38BDF8] hover:text-white transition-all cursor-pointer flex items-center gap-1.5"
                onClick={() => {
                  const isOn = toggleAudio();
                  showToast(isOn ? 'Tactical audio enabled' : 'Tactical audio muted');
                }}
              >
                <span id="audio-dot" className={`w-1.5 h-1.5 rounded-full ${audioEnabledRef.current ? 'bg-[#22D3EE] shadow-[0_0_8px_#22D3EE]' : 'bg-slate-500'}`}></span>
                <span id="audio-label">{audioEnabledRef.current ? 'SFX: ON' : 'SFX: OFF'}</span>
              </button>
              <button
                id="btn-boot-sound"
                title="Play Core Power-Up Sequence"
                className="px-2 sm:px-2.5 py-1 rounded-md border border-[#F59E0B]/40 bg-[#1A1205]/70 text-[#FCD34D] hover:border-[#F59E0B] hover:bg-[#F59E0B]/20 transition-all cursor-pointer"
                onClick={() => {
                  if (state.coreStatus === 'HALTED') setCoreStatus('THINKING');
                  playBoot();
                  triggerBurst(2400);
                  addSystemLog('Sentient Core', 'Core power-up sequence executed.');
                  showToast('APEX Sentient Core — ONLINE');
                }}
              >
                BOOT
              </button>
              <span id="active-agents-count" className="hidden md:inline-block px-2.5 py-1 rounded-md border border-[#38BDF8]/25 bg-[#0A1423]/70">
                AGENTS: {state.coreStatus === 'HALTED' ? 0 : agents.filter(a => a.active).length}/{agents.length} ACTIVE
              </span>
            </div>
          </header>

          {/* Middle Wings */}
          <main className="flex-1 w-full flex items-center justify-between px-2 sm:px-6 md:px-12 lg:px-16 my-1 sm:my-2 min-h-0 overflow-hidden">
            <section ref={leftWingRef} id="left-wing" className="wing-container flex flex-col justify-evenly h-full max-h-[540px] py-1 pointer-events-auto z-20" />
            <div id="core-hitbox" title="Click Sentient Core to trigger neural pulse" className="w-[160px] sm:w-[240px] md:w-[320px] h-full max-h-[380px] cursor-pointer pointer-events-auto rounded-full shrink-0"
              onClick={() => {
                if (state.coreStatus === 'HALTED') { playClick(300); showToast('Core is halted. Click RESUME to reactivate.'); return; }
                playDispatch();
                triggerBurst(2200);
                addSystemLog('Sentient Core', 'Manual neural synchronization pulse emitted.');
                showToast('Neural core pulse synchronized');
              }}
            />
            <section ref={rightWingRef} id="right-wing" className="wing-container flex flex-col justify-evenly h-full max-h-[540px] py-1 pointer-events-auto z-20" />
          </main>

          {/* Bottom Command Dock */}
          <footer className="w-full flex justify-center items-center shrink-0 pt-1 pb-0.5 sm:pb-1 pointer-events-auto z-30">
            <div className="command-dock rounded-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2.5 w-full max-w-[660px]">
              <button id="btn-terminal" className="dock-btn" title="Open Live Execution Log" onClick={() => { playClick(880); openTerminalInspector(); }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
              </button>
              <button id="btn-alerts" className="dock-btn" title="System Status & Diagnostics" onClick={() => { playClick(880); openResourceInspector('telemetry'); }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </button>
              <button id="btn-voice" className={`dock-btn ${state.coreStatus === 'LISTENING' ? 'active' : ''}`} title="Toggle Voice Listening Mode (Ctrl+Space)" onClick={() => {
                if (state.coreStatus === 'HALTED') return;
                const next = state.coreStatus === 'LISTENING' ? 'THINKING' : 'LISTENING';
                playVoice(next === 'LISTENING');
                setCoreStatus(next);
                addSystemLog('Voice Engine', next === 'LISTENING' ? 'Microphone active (Whisper Flow)' : 'Voice input closed');
                showToast(next === 'LISTENING' ? 'Listening... (Ctrl+Space to stop)' : 'Voice dictation stopped');
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="10" x2="4" y2="14"></line><line x1="8" y1="6" x2="8" y2="18"></line><line x1="12" y1="3" x2="12" y2="21"></line><line x1="16" y1="7" x2="16" y2="17"></line><line x1="20" y1="10" x2="20" y2="14"></line></svg>
              </button>

              <form id="command-form" className="flex-1 mx-1" onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem('command-input') as HTMLInputElement;
                const cmd = input.value.trim();
                if (!cmd) return;
                input.value = '';

                if (cmd.toLowerCase() === '/kill') { playKill(); setCoreStatus('HALTED'); showToast('EMERGENCY HALT executed'); return; }
                if (cmd.toLowerCase() === '/resume') { playBoot(); setCoreStatus('THINKING'); showToast('Core resumed'); return; }
                if (cmd.toLowerCase().startsWith('/memory')) { playDispatch(); const ctxRes = resources.find(r => r.id === 'context'); if (ctxRes) ctxRes.pct = 15; addSystemLog('SQLite Memory', `Executed command: ${cmd}`); triggerBurst(1800); drawConstellationPaths(); showToast('Memory operation executed'); return; }

                if (state.coreStatus === 'HALTED') { playBoot(); setCoreStatus('THINKING'); } else { playDispatch(); }

                const mentionMatch = cmd.match(/^@(\w+)/i);
                if (mentionMatch) {
                  const targetName = mentionMatch[1].toLowerCase();
                  const matchedAgent = agents.find(a => a.id.toLowerCase().includes(targetName) || a.name.toLowerCase().includes(targetName));
                  if (matchedAgent) {
                    matchedAgent.active = true;
                    matchedAgent.task = cmd;
                    matchedAgent.logs.unshift(`Dispatched: ${cmd}`);
                    addSystemLog(matchedAgent.name, `Executing: ${cmd}`);
                    triggerBurst(2200);
                    drawConstellationPaths();
                    openAgentInspector(matchedAgent.id);
                    showToast(`Dispatched to ${matchedAgent.name}`);
                    return;
                  }
                }

                addSystemLog('Orchestrator', `Command dispatched: ${cmd}`);
                triggerBurst(2000);
                showToast(`Dispatched: ${cmd}`);
              }}>
                <input
                  id="command-input"
                  name="command-input"
                  type="text"
                  autoComplete="off"
                  placeholder="Dispatch command... e.g. @Coder build module or /memory flush"
                  className="w-full h-9 px-3 rounded-lg bg-[#050C17]/90 border border-[#38BDF8]/30 text-xs sm:text-sm text-[#F8FAFC] placeholder-[#7DD3FC]/40 font-mono-tech focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]/50 transition-all select-text"
                />
              </form>

              <button id="btn-focus" className={`dock-btn ${state.focusMode ? 'active' : ''}`} title="Toggle Sentient Core Focus Mode" onClick={() => { playClick(940); setState(prev => ({ ...prev, focusMode: !prev.focusMode })); applyFocusVisuals(); showToast(state.focusMode ? 'Constellation Mode restored' : 'Sentient Focus Mode enabled'); }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 22 12 12 22 2 12 12 2"></polygon><circle cx="12" cy="12" r="2.5"></circle></svg>
              </button>
              <button id="btn-settings" className="dock-btn" title="Core & MCP Settings" onClick={() => { playClick(880); openSettingsInspector(); }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
              <button id="btn-inspector" className="dock-btn" title="Toggle Inspector Drawer" onClick={() => { playClick(820); if (inspectorContent) closeInspector(); else openTerminalInspector(); }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
              </button>

              <button
                id="btn-kill"
                className={`btn-kill h-9 px-3.5 sm:px-4 rounded-lg font-mono-tech text-xs font-semibold tracking-wider uppercase cursor-pointer whitespace-nowrap ml-1 ${state.coreStatus === 'HALTED' ? 'resumed' : ''}`}
                onClick={() => {
                  if (state.coreStatus === 'HALTED') {
                    playBoot();
                    setCoreStatus(state.previousStatus || 'THINKING');
                    triggerBurst(2200);
                    addSystemLog('Orchestrator', 'Emergency halt cleared — systems resumed.');
                    showToast('All systems resumed');
                  } else {
                    playKill();
                    setCoreStatus('HALTED');
                    addSystemLog('SAFETY', 'EMERGENCY KILL SWITCH ACTIVATED — All agents halted.');
                    showToast('EMERGENCY HALT: All agents stopped');
                  }
                }}
              >
                {state.coreStatus === 'HALTED' ? 'RESUME' : 'KILL ALL'}
              </button>
            </div>
          </footer>
        </div>

        {/* Inspector Drawer */}
        <aside ref={inspectorDrawerRef} id="inspector-drawer" className={`inspector-drawer fixed top-0 right-0 h-full w-full sm:w-[360px] z-40 flex flex-col ${inspectorContent ? 'open' : ''}`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#38BDF8]/20">
            <div className="flex items-center gap-2.5">
              <span id="inspector-badge" className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: inspectorContent?.badgeColor, boxShadow: `0 0 8px ${inspectorContent?.badgeColor}` }}></span>
              <div>
                <h2 id="inspector-title" className="text-sm font-semibold tracking-wide text-white">{inspectorContent?.title}</h2>
                <p id="inspector-subtitle" className="font-mono-tech text-[10px] uppercase tracking-widest text-[#7DD3FC]/70">{inspectorContent?.subtitle}</p>
              </div>
            </div>
            <button id="btn-close-inspector" className="dock-btn" title="Close Inspector" onClick={() => { playClick(640); closeInspector(); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="inspector-body" className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {inspectorContent?.body}
          </div>
          <div className="px-5 py-3 border-t border-[#38BDF8]/15 flex items-center justify-between font-mono-tech text-[10px] text-[#7DD3FC]/60">
            <span>APEX CORE v4.1</span>
            <span id="inspector-footer-status">LINK: {state.coreStatus === 'HALTED' ? 'HALTED' : state.coreStatus}</span>
          </div>
        </aside>

        {/* Toast */}
        <div ref={hudToastRef} id="hud-toast" className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg command-dock font-mono-tech text-xs text-[#E0F2FE] ${toastMessage ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'} transition-all pointer-events-none`}>
          {toastMessage}
        </div>

        {/* Approval Overlay */}
        <div className={`absolute inset-0 z-60 flex items-center justify-center bg-black/80 ${risk}`}>
          <div className="bg-[#07192E] border border-[#38BDF8]/30 rounded-xl p-6 max-w-md w-full mx-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono-tech text-lg text-[#F59E0B]">⚠ APPROVAL REQUIRED</h3>
              <span className={`px-2 py-1 rounded text-xs font-mono-tech ${risk === 'risk-high' ? 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/50' : risk === 'risk-medium' ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/50' : 'bg-[#38BDF8]/20 text-[#38BDF8] border border-[#38BDF8]/50'}`}>
                {action.risk.toUpperCase()}
              </span>
            </div>
            <div className="space-y-3 mb-4 text-sm">
              <div><span className="text-[#7DD3FC]/70">Action: </span><span className="text-white font-mono-tech">{action.type}</span></div>
              <div><span className="text-[#7DD3FC]/70">Target: </span><span className="text-white">{action.target}</span></div>
              <div><span className="text-[#7DD3FC]/70">Reason: </span><span className="text-[#E2E8F0]">{action.reason}</span></div>
            </div>
            <div className="text-xs text-[#94A3B8] mb-4">{action.explanation}</div>
            <div className="flex gap-2 justify-end">
              <button className="btn-reject px-4 py-2 rounded-lg font-mono-tech text-xs uppercase tracking-wider bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 cursor-pointer" onClick={() => onRespond(false)}>REJECT</button>
              <button className="btn-approve px-4 py-2 rounded-lg font-mono-tech text-xs uppercase tracking-wider bg-[#F59E0B]/20 border border-[#F59E0B]/60 text-[#FCD34D] hover:bg-[#F59E0B]/30 cursor-pointer" onClick={() => onRespond(true)}>APPROVE</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
