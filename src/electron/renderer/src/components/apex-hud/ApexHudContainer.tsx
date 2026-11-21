import React, { type ReactNode, useState } from 'react';
import { ConstellationNetwork } from './ConstellationNetwork';
import { NodeInspectorDrawer } from './NodeInspectorDrawer';
import { SentientCoreCanvas } from './SentientCoreCanvas';
import { TelemetryOverlay } from './TelemetryOverlay';
import type { ApexNodeId, ApexTelemetry } from './useApexTelemetry';
import './apex-hud.css';

interface ApexHudContainerProps {
  commandDock: ReactNode;
  mode: 'planning' | 'build' | null;
  onKillAll: () => void;
  onOpenPermissions: () => void;
  onViewChange: (view: 'apex' | 'dag') => void;
  onVoiceToggle: () => void;
  telemetry: ApexTelemetry;
  view: 'apex' | 'dag';
  voiceOn: boolean;
}

export function ApexHudContainer({
  commandDock,
  mode,
  onKillAll,
  onOpenPermissions,
  onViewChange,
  onVoiceToggle,
  telemetry,
  view,
  voiceOn,
}: ApexHudContainerProps): React.JSX.Element {
  const [selectedNode, setSelectedNode] = useState<ApexNodeId | null>(null);
  const [isolatedNode, setIsolatedNode] = useState<ApexNodeId | null>(null);
  const focused = telemetry.state === 'LISTENING' || telemetry.state === 'SPEAKING';

  const simulate = (): void => {
    telemetry.dispatchAgentPulse('coder');
    telemetry.dispatchAgentPulse('memory');
    telemetry.setCoreState('THINKING');
  };

  return (
    <main className={`apex-hud ${focused ? 'is-focused' : ''}`}>
      <ConstellationNetwork
        activeNodes={telemetry.activeNodes}
        dimmed={focused}
        isolatedNode={isolatedNode}
        onSelectNode={setSelectedNode}
      />
      <section className="apex-core-wrap">
        <SentientCoreCanvas state={telemetry.state} />
        <div className="apex-core-caption"><strong>AI COMMAND CENTER</strong><span>SENTIENT CORE / {telemetry.state}</span></div>
      </section>
      <TelemetryOverlay
        commandDock={commandDock}
        memory={telemetry.memory}
        mode={mode}
        onKillAll={onKillAll}
        onOpenMemory={() => setSelectedNode('memory')}
        onOpenPermissions={onOpenPermissions}
        onSimulation={simulate}
        onViewChange={onViewChange}
        onVoiceToggle={onVoiceToggle}
        state={telemetry.state}
        view={view}
        voiceOn={voiceOn}
      />
      <NodeInspectorDrawer
        nodeId={selectedNode}
        onClose={() => setSelectedNode(null)}
        onFlushContext={() => telemetry.recordOutput('تم تفريغ سياق العرض. لم تتغير بيانات الذاكرة المحلية.')}
        onIsolate={(node) => setIsolatedNode((current) => current === node ? null : node)}
        onPausePulse={(node) => telemetry.dispatchAgentPulse(node, 'idle')}
        telemetry={telemetry}
      />
    </main>
  );
}
