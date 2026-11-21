import React, { useState } from 'react';
import { TacticalIcon } from './TacticalIcons';
import type { ApexNodeId } from './useApexTelemetry';
import type { ApexTelemetry } from './useApexTelemetry';

interface NodeInspectorDrawerProps {
  nodeId: ApexNodeId | null;
  onClose: () => void;
  onFlushContext: () => void;
  onIsolate: (nodeId: ApexNodeId | null) => void;
  onPausePulse: (nodeId: ApexNodeId) => void;
  telemetry: ApexTelemetry;
}

const AGENT_NODES: readonly ApexNodeId[] = ['orchestrator', 'mentor', 'coder', 'designer', 'advisor', 'browser', 'terminal'];
const LABELS: Record<ApexNodeId, string> = {
  orchestrator: 'ORCHESTRATOR', mentor: 'MENTOR', coder: 'CODER', designer: 'DESIGNER',
  advisor: 'ADVISOR', browser: 'BROWSER PILOT', terminal: 'OS COMMANDER', memory: 'SQLITE MEMORY',
  context: 'CONTEXT WINDOW', mcp: 'MCP SERVERS', files: 'FILE SYSTEM', voice: 'VOICE ENGINE', telemetry: 'SYSTEM TELEMETRY',
};

function ResourceControls(): React.JSX.Element {
  const [visible, setVisible] = useState<Record<string, boolean>>({ Playwright: false, Desktop: false, Files: true });
  return (
    <>
      <p className="apex-inspector-note">تُعرض حالة الربط المتاحة للواجهة. هذه المفاتيح لا تغيّر إعدادات MCP الفعلية.</p>
      {Object.entries(visible).map(([name, enabled]) => (
        <label className="apex-toggle-row" key={name}>
          <span>{name}</span>
          <input checked={enabled} onChange={() => setVisible((current) => ({ ...current, [name]: !current[name] }))} type="checkbox" />
        </label>
      ))}
      <dl className="apex-readout-list">
        <div><dt>LATENCY</dt><dd>LOCAL</dd></div>
        <div><dt>CPU</dt><dd>UNAVAILABLE</dd></div>
        <div><dt>RAM</dt><dd>UNAVAILABLE</dd></div>
      </dl>
    </>
  );
}

export function NodeInspectorDrawer({
  nodeId,
  onClose,
  onFlushContext,
  onIsolate,
  onPausePulse,
  telemetry,
}: NodeInspectorDrawerProps): React.JSX.Element | null {
  if (!nodeId) return null;
  const isAgent = AGENT_NODES.includes(nodeId);
  const isMemory = nodeId === 'memory' || nodeId === 'context';
  const memory = telemetry.memory;

  return (
    <aside aria-label="مفتش العقدة" className="apex-inspector" dir="ltr">
      <header className="apex-inspector-header">
        <div><span>NODE INSPECTOR</span><strong>{LABELS[nodeId]}</strong></div>
        <button aria-label="إغلاق المفتش" className="apex-icon-button" onClick={onClose} type="button"><TacticalIcon name="close" /></button>
      </header>
      {isAgent ? (
        <section>
          <div className="apex-section-label">ACTIVE TASK</div>
          <p className="apex-inspector-copy">{telemetry.taskLabel ?? 'لا توجد مهمة نشطة لهذه العقدة.'}</p>
          <div className="apex-section-label">LAST OUTPUT</div>
          <pre className="apex-output-preview">{telemetry.lastOutput}</pre>
          <div className="apex-inspector-actions">
            <button onClick={() => onPausePulse(nodeId)} type="button"><TacticalIcon name="pause" />PAUSE PULSE</button>
            <button onClick={() => onIsolate(nodeId)} type="button"><TacticalIcon name="orchestrator" />ISOLATE VIEW</button>
          </div>
        </section>
      ) : isMemory ? (
        <section>
          <div className="apex-section-label">VECTOR MEMORY</div>
          <dl className="apex-readout-list">
            <div><dt>CONVERSATIONS</dt><dd>{memory?.conversations ?? 'UNAVAILABLE'}</dd></div>
            <div><dt>SKILLS</dt><dd>{memory?.skills ?? 'UNAVAILABLE'}</dd></div>
            <div><dt>PROJECTS</dt><dd>{memory?.projects ?? 'UNAVAILABLE'}</dd></div>
            <div><dt>DECISIONS</dt><dd>{memory?.decisions ?? 'UNAVAILABLE'}</dd></div>
          </dl>
          <p className="apex-inspector-note">يعيد الزر ضبط سياق العرض فقط؛ لا يحذف أي بيانات من SQLite.</p>
          <button className="apex-wide-button" onClick={onFlushContext} type="button">FLUSH VIEW CONTEXT</button>
        </section>
      ) : (
        <section>
          <div className="apex-section-label">RESOURCE STATUS</div>
          <ResourceControls />
        </section>
      )}
    </aside>
  );
}
