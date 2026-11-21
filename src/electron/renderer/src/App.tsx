import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AgentMap } from './AgentMap';
import { Chat } from './Chat';
import { ApprovalModal } from './ApprovalModal';
import { PermissionPanel } from './PermissionPanel';
import { AssistantControls } from './AssistantControls';
import type {
  ApprovalRequestData,
  AssistantMode,
  AssistantPermission,
  AssistantSettings,
} from './window';
import { useApexTelemetry } from './components/apex-hud/useApexTelemetry';
import { ApexHudContainer } from './components/apex-hud/ApexHudContainer';

export function App(): React.JSX.Element {
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [taskInfo, setTaskInfo] = useState<{ index: number; total: number } | null>(null);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequestData | null>(null);
  const [voiceOn, setVoiceOn] = useState<boolean>(true);
  const [assistantSettings, setAssistantSettings] = useState<AssistantSettings | null>(null);
  const [permissionsOpen, setPermissionsOpen] = useState<boolean>(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [view, setView] = useState<'apex' | 'dag'>('apex');

  // Initialize APEX telemetry hook — subscribes to IPC events with graceful fallbacks
  const apexTelemetry = useApexTelemetry();

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

  const handleModeChange = async (mode: AssistantMode): Promise<void> => {
    try {
      setAssistantSettings(await window.api.setAssistantMode(mode));
      setSettingsError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsError(`تعذر تغيير الوضع: ${message}`);
    }
  };

  const handlePermissionChange = async (
    permission: AssistantPermission,
    enabled: boolean,
  ): Promise<void> => {
    try {
      setAssistantSettings(await window.api.setPermission(permission, enabled));
      setSettingsError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSettingsError(`تعذر حفظ الصلاحية: ${message}`);
    }
  };

  // جلب حالة الصوت عند التحميل
  useEffect(() => {
    if (window.api?.getVoiceStatus) {
      void window.api.getVoiceStatus()
        .then((status: boolean) => setVoiceOn(status))
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setSettingsError(`تعذر تحميل حالة الصوت: ${message}`);
        });
    }
    let active = true;
    void window.api.getAssistantSettings()
      .then((settings: AssistantSettings) => {
        if (active) setAssistantSettings(settings);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        if (active) setSettingsError(`تعذر تحميل الإعدادات: ${message}`);
      });
    return () => {
      active = false;
    };
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
    const unsubscribeAudio = window.api.onVoiceAudio(audioCb);

    const stopCb = () => {
      audioQueueRef.current = [];
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      isPlayingRef.current = false;
    };
    const unsubscribeStop = window.api.onVoiceStop(stopCb);

    return () => {
      unsubscribeAudio();
      unsubscribeStop();
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
      {view === 'apex' ? (
        <ApexHudContainer
          commandDock={
            <Chat
              onActiveAgent={onAgentChange}
              onTaskInfo={onTaskChange}
              onApprovalRequest={setApprovalRequest}
            />
          }
          mode={assistantSettings?.mode ?? null}
          onKillAll={() => {
            void handleStopVoice();
          }}
          onOpenPermissions={() => setPermissionsOpen(true)}
          onViewChange={(v) => setView(v)}
          onVoiceToggle={() => void handleToggleVoice()}
          telemetry={apexTelemetry}
          view={view}
          voiceOn={voiceOn}
        />
      ) : (
        <>
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
            <AssistantControls
              mode={assistantSettings?.mode ?? null}
              voiceOn={voiceOn}
              permissionsOpen={permissionsOpen}
              onModeChange={(mode) => void handleModeChange(mode)}
              onTogglePermissions={() => setPermissionsOpen((open) => !open)}
              onToggleVoice={() => void handleToggleVoice()}
              onStopVoice={() => void handleStopVoice()}
            />
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
        </>
      )}
      <PermissionPanel
        open={permissionsOpen}
        settings={assistantSettings}
        error={settingsError}
        onPermissionChange={(permission, enabled) => {
          void handlePermissionChange(permission, enabled);
        }}
      />
      <ApprovalModal request={approvalRequest} onRespond={handleApprovalRespond} />
    </div>
  );
}
