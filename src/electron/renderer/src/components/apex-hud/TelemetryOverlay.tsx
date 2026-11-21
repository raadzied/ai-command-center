import React, { type ReactNode, useEffect, useState } from 'react';
import { TacticalIcon } from './TacticalIcons';
import type { ApexCoreState, ApexMemoryStats } from './useApexTelemetry';

interface TelemetryOverlayProps {
  commandDock: ReactNode;
  memory: ApexMemoryStats | null;
  mode: 'planning' | 'build' | null;
  onKillAll: () => void;
  onOpenMemory: () => void;
  onOpenPermissions: () => void;
  onSimulation: () => void;
  onViewChange: (view: 'apex' | 'dag') => void;
  onVoiceToggle: () => void;
  state: ApexCoreState;
  view: 'apex' | 'dag';
  voiceOn: boolean;
}

function useClock(): string {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-GB'));
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date().toLocaleTimeString('en-GB')), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return time;
}

export function TelemetryOverlay({
  commandDock,
  memory,
  mode,
  onKillAll,
  onOpenMemory,
  onOpenPermissions,
  onSimulation,
  onViewChange,
  onVoiceToggle,
  state,
  view,
  voiceOn,
}: TelemetryOverlayProps): React.JSX.Element {
  const time = useClock();
  return (
    <>
      <section className="apex-telemetry apex-telemetry-left">
        <strong>{time}</strong>
        <span>STATUS: {state}</span>
        <span>MODEL: GEMINI 2.5 / GROQ</span>
        <span>MEMORY: {memory ? `${memory.conversations} LOGS` : 'LOCAL'}</span>
        <span>MODE: {mode?.toUpperCase() ?? 'LOADING'}</span>
      </section>
      <section className="apex-telemetry apex-telemetry-right">
        <div className="apex-view-switcher" role="group" aria-label="تبديل العرض">
          <button className={view === 'apex' ? 'selected' : ''} onClick={() => onViewChange('apex')} type="button">APEX HUD</button>
          <button className={view === 'dag' ? 'selected' : ''} onClick={() => onViewChange('dag')} type="button">DAG FLOW</button>
        </div>
        <button aria-label="إعدادات الصلاحيات" className="apex-icon-button" onClick={onOpenPermissions} title="الصلاحيات" type="button"><TacticalIcon name="settings" /></button>
        <button className="apex-kill-button" onClick={onKillAll} title="يوقف النطق والنبضات المرئية" type="button"><TacticalIcon name="kill" />KILL ALL</button>
      </section>
      <section className="apex-tactical-dock">
        <button aria-label="تبديل الصوت" className={voiceOn ? 'apex-dock-button active' : 'apex-dock-button'} onClick={onVoiceToggle} title="Ctrl+Space للإملاء" type="button"><TacticalIcon name="mic" /><kbd>CTRL SPACE</kbd></button>
        <div className="apex-command-slot">{commandDock}</div>
        <button aria-label="فحص الذاكرة" className="apex-dock-button" onClick={onOpenMemory} type="button"><TacticalIcon name="memory" /></button>
        <button aria-label="اختبار نبضات العرض" className="apex-dock-button" onClick={onSimulation} type="button"><TacticalIcon name="play" /></button>
      </section>
    </>
  );
}
