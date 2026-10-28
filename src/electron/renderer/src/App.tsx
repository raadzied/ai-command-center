import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentMap } from './AgentMap';
import { Chat } from './Chat';
import { ApprovalModal } from './ApprovalModal';
import type { ApprovalRequestData } from './window';

interface VoiceStatus {
  active: boolean;
  listening: boolean;
  speaking: boolean;
}

export function App(): React.JSX.Element {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [taskInfo, setTaskInfo] = useState<{ index: number; total: number } | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequestData | null>(null);
  const [voiceOn, setVoiceOn] = useState<boolean>(true);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({ active: true, listening: false, speaking: false });

  // الطابور ومشغل الصوت
  const audioQueueRef = useRef<Array<{ base64Mp3: string; agentName: string | null }>>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef<boolean>(false);

  const onAgentChange = (agent: string | null): void => {
    setActiveAgent(agent);
  };

  const onTaskChange = (info: { index: number; total: number } | null): void => {
    setTaskInfo(info);
  };

  const handleApprovalRespond = (approved: boolean): void => {
    if (approvalRequest) {
      window.api.respondApproval(approvalRequest.auditId, approved);
      setApprovalRequest(null);
    }
  };

  const handleToggleVoice = async (): Promise<void> => {
    const next = await window.api.toggleVoice(!voiceOn);
    setVoiceOn(next);
    setVoiceStatus((prev) => ({ ...prev, active: next }));
  };

  const handleStopVoice = async (): Promise<void> => {
    await window.api.stopVoice();
    setVoiceStatus((prev) => ({ ...prev, speaking: false, listening: false }));
  };

  const handleStartListening = async (): Promise<void> => {
    setVoiceStatus((prev) => ({ ...prev, listening: true, speaking: false }));
  };

  const handleStopListening = async (): Promise<void> => {
    setVoiceStatus((prev) => ({ ...prev, listening: false }));
  };

  // جلب حالة الصوت عند التحميل
  useEffect(() => {
    if (window.api?.getVoiceStatus) {
      void window.api.getVoiceStatus().then((status: boolean) => setVoiceOn(status));
    }
  }, []);

  // مستمع الصوت القادم من Electron
  useEffect(() => {
    const audioCb = (payload: { base64Mp3: string; agentName: string | null }) => {
      audioQueueRef.current.push(payload);
      playNextInQueue();
    };
    window.api?.onVoiceAudio?.(audioCb);

    const stopCb = () => {
      audioQueueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      isPlayingRef.current = false;
      setVoiceStatus((prev) => ({ ...prev, speaking: false }));
    };
    window.api?.onVoiceStop?.(stopCb);

    return () => {
      audioQueueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      isPlayingRef.current = false;
    };
  }, []);

  const playNextInQueue = useCallback((): void => {
    if (isPlayingRef.current) return;
    const next = audioQueueRef.current.shift();
    if (!next) {
      setVoiceStatus((prev) => ({ ...prev, speaking: false }));
      return;
    }
    isPlayingRef.current = true;
    setVoiceStatus((prev) => ({ ...prev, speaking: true }));
    const audio = new Audio(`data:audio/mp3;base64,${next.base64Mp3}`);
    if (next.agentName === 'coder') audio.playbackRate = 1.12;
    else if (next.agentName === 'designer') audio.playbackRate = 1.05;
    else audio.playbackRate = 1.0;
    currentAudioRef.current = audio;
    audio.onended = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      setVoiceStatus((prev) => ({ ...prev, speaking: false }));
      playNextInQueue();
    };
    audio.onerror = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      setVoiceStatus((prev) => ({ ...prev, speaking: false }));
      playNextInQueue();
    };
    void audio.play().catch(() => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      setVoiceStatus((prev) => ({ ...prev, speaking: false }));
    });
  }, []);

  return (
    <div className="app">
      <div className="hud">
        <div className="hud-brand">JARVIS OS</div>
        <div className="hud-item">
          <span className={`hud-dot ${activeAgent ? 'busy' : 'idle'}`} />
          {activeAgent ? `ACTIVE: ${activeAgent.toUpperCase()}` : 'IDLE'}
        </div>
        <div className="hud-item">
          <span className={`hud-dot ${taskInfo ? 'busy' : 'idle'}`} />
          {taskInfo ? `TASK ${taskInfo.index}/${taskInfo.total}` : 'NO TASK'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={() => void handleToggleVoice()}
            style={{
              background: voiceOn ? '#0d1828' : '#1a2634',
              color: voiceOn ? '#00e5ff' : '#8a9ab0',
              border: `1px solid ${voiceOn ? '#00e5ff' : '#1a2634'}`,
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Consolas', monospace",
              textTransform: 'uppercase',
            }}
          >
            {voiceOn ? '🔊 الصوت: تشغيل' : '🔇 الصوت: إيقاف'}
          </button>
          <button
            type="button"
            onClick={() => void handleStopVoice()}
            style={{
              background: '#1a2634',
              color: '#e8f0f8',
              border: '1px solid #1a2634',
              borderRadius: '8px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: "'Consolas', monospace",
            }}
          >
            ⏹️ إيقاف النطق
          </button>
          <button
            type="button"
            onClick={() => void handleStartListening()}
            style={{
              background: voiceStatus.listening ? '#1a1a0a' : '#0d1828',
              color: voiceStatus.listening ? '#ffb800' : '#00e5ff',
              border: `1px solid ${voiceStatus.listening ? '#ffb800' : '#00e5ff'}`,
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 800,
              fontFamily: "'Consolas', monospace",
              textTransform: 'uppercase',
            }}
          >
            {voiceStatus.listening ? '🎙️ الاستماع...' : '🎤 البدء بالتحدث'}
          </button>
        </div>
        <div className="hud-spacer" />
        <div className="hud-item small">
          <span className={`hud-dot active`} />
          جارفيس نشط
        </div>
      </div>
      <div className="app-body">
        <div className="map-panel">
          <AgentMap activeAgent={activeAgent} taskInfo={taskInfo} />
        </div>
        <div className="chat-panel">
          <Chat
            onActiveAgent={onAgentChange}
            onTaskInfo={onTaskChange}
            onApprovalRequest={setApprovalRequest}
            voiceOn={voiceOn}
            voiceStatus={voiceStatus}
            onStartListening={handleStartListening}
            onStopListening={handleStopListening}
          />
        </div>
      </div>
      <ApprovalModal request={approvalRequest} onRespond={handleApprovalRespond} />
      <div className="voice-btn" onClick={() => void handleStartListening()}>
        {voiceStatus.listening ? '🎙️' : voiceStatus.speaking ? '🔊' : '🎤'}
      </div>
    </div>
  );
}
