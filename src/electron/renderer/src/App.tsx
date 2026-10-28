import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentMap } from './AgentMap';
import { Chat } from './Chat';
import { ApprovalModal } from './ApprovalModal';
import type { ApprovalRequestData } from './window';

export function App(): React.JSX.Element {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [taskInfo, setTaskInfo] = useState<{ index: number; total: number } | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequestData | null>(null);
  const [voiceOn, setVoiceOn] = useState<boolean>(true);

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
  };

  const handleStopVoice = async (): Promise<void> => {
    await window.api.stopVoice();
  };

  // جلب حالة الصوت عند التحميل
  useEffect(() => {
    if (window.api?.getVoiceStatus) {
      void window.api.getVoiceStatus().then((status: boolean) => setVoiceOn(status));
    }
  }, []);

  const playNextInQueue = useCallback((): void => {
    if (isPlayingRef.current) return;
    const next = audioQueueRef.current.shift();
    if (!next) return;
    isPlayingRef.current = true;
    const audio = new Audio(`data:audio/mp3;base64,${next.base64Mp3}`);
    if (next.agentName === 'coder') audio.playbackRate = 1.12;
    else if (next.agentName === 'designer') audio.playbackRate = 1.05;
    else audio.playbackRate = 1.0;
    currentAudioRef.current = audio;
    audio.onended = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextInQueue();
    };
    audio.onerror = () => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
      playNextInQueue();
    };
    void audio.play().catch(() => {
      isPlayingRef.current = false;
      currentAudioRef.current = null;
    });
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
  }, [playNextInQueue]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="hud-brand">
          <span style={{ color: '#00E5FF', animation: 'pulse-brand 2s infinite' }}>●</span>
          <span>مركز القيادة الذكي · AI Command Center</span>
          <span style={{ fontSize: '10px', background: 'rgba(0, 229, 255, 0.15)', color: '#00E5FF', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0, 229, 255, 0.3)' }}>V4.2 PRO</span>
        </div>
        <div className="hud-items">
          <div className="hud-item">
            <span>⚡ Gemini 2.5 + Groq Whisper</span>
          </div>
          <div className="hud-item">
            <span>🧠 SQLite-Vec RAG</span>
          </div>
          <div className="hud-item">
            <span className={`hud-dot ${activeAgent ? 'busy' : 'idle'}`} />
            <span>{activeAgent ? `الوكيل: ${activeAgent.toUpperCase()}` : 'في وضع الاستعداد'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => void handleToggleVoice()}
            style={{
              background: voiceOn ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              color: voiceOn ? '#00E5FF' : '#8A99AD',
              border: `1px solid ${voiceOn ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
              borderRadius: '6px',
              padding: '5px 10px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: "'Consolas', monospace",
              fontWeight: 700,
            }}
          >
            {voiceOn ? '🔊 الصوت: مفعل' : '🔇 الصوت: مكتوم'}
          </button>
          <button
            type="button"
            onClick={() => void handleStopVoice()}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#E0E6ED',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              padding: '5px 8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: "'Consolas', monospace",
              fontWeight: 700,
            }}
          >
            ⏹️ إيقاف النطق
          </button>
        </div>
      </header>
      <div className="app-body">
        <div className="map-panel">
          <AgentMap activeAgent={activeAgent} taskInfo={taskInfo} />
        </div>
        <div className="chat-panel">
          <Chat
            onActiveAgent={onAgentChange}
            onTaskInfo={onTaskChange}
            onApprovalRequest={setApprovalRequest}
          />
        </div>
      </div>
      <ApprovalModal request={approvalRequest} onRespond={handleApprovalRespond} />
    </div>
  );
}
