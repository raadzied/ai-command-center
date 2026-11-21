import React from 'react';
import { TacticalIcon, type TacticalIconName } from './TacticalIcons';
import type { ApexNodeId, ApexNodeStatus } from './useApexTelemetry';

interface ConstellationNetworkProps {
  activeNodes: Partial<Record<ApexNodeId, ApexNodeStatus>>;
  dimmed: boolean;
  isolatedNode: ApexNodeId | null;
  onSelectNode: (node: ApexNodeId) => void;
}

interface ConstellationNode {
  id: ApexNodeId;
  icon: TacticalIconName;
  label: string;
  side: 'left' | 'right';
  y: number;
}

const NODES: readonly ConstellationNode[] = [
  { id: 'orchestrator', icon: 'orchestrator', label: 'ORCHESTRATOR', side: 'left', y: 18 },
  { id: 'coder', icon: 'coder', label: 'CODER', side: 'left', y: 31 },
  { id: 'designer', icon: 'designer', label: 'DESIGNER', side: 'left', y: 44 },
  { id: 'advisor', icon: 'advisor', label: 'ADVISOR', side: 'left', y: 57 },
  { id: 'browser', icon: 'browser', label: 'BROWSER PILOT', side: 'left', y: 70 },
  { id: 'terminal', icon: 'terminal', label: 'OS COMMANDER', side: 'left', y: 83 },
  { id: 'memory', icon: 'memory', label: 'SQLITE MEMORY', side: 'right', y: 18 },
  { id: 'context', icon: 'context', label: 'CONTEXT WINDOW', side: 'right', y: 31 },
  { id: 'mcp', icon: 'mcp', label: 'MCP SERVERS', side: 'right', y: 44 },
  { id: 'files', icon: 'files', label: 'FILE SYSTEM', side: 'right', y: 57 },
  { id: 'voice', icon: 'mic', label: 'VOICE ENGINE', side: 'right', y: 70 },
  { id: 'telemetry', icon: 'telemetry', label: 'SYSTEM TELEMETRY', side: 'right', y: 83 },
];

function nodeOpacity(nodeId: ApexNodeId, dimmed: boolean, isolated: ApexNodeId | null): number {
  if (isolated && nodeId !== isolated) return 0.14;
  return dimmed ? 0.18 : 1;
}

export function ConstellationNetwork({
  activeNodes,
  dimmed,
  isolatedNode,
  onSelectNode,
}: ConstellationNetworkProps): React.JSX.Element {
  return (
    <svg aria-label="شبكة موارد المساعد" className="apex-constellation" viewBox="0 0 100 100">
      <defs>
        <filter id="apexGlow"><feGaussianBlur stdDeviation="0.45" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      {NODES.map((node) => {
        const active = activeNodes[node.id] === 'active';
        const errored = activeNodes[node.id] === 'error';
        const x = node.side === 'left' ? 13 : 87;
        const controlX = node.side === 'left' ? 33 : 67;
        const textAnchor = node.side === 'left' ? 'start' : 'end';
        const textX = node.side === 'left' ? x + 4.4 : x - 4.4;
        const opacity = nodeOpacity(node.id, dimmed, isolatedNode);
        const statusClass = errored ? 'error' : active ? 'active' : 'idle';
        return (
          <g className="apex-constellation-link" key={node.id} opacity={opacity}>
            <path
              className={active ? 'apex-link apex-link-active' : 'apex-link'}
              d={`M50 50 C ${controlX} 50, ${controlX} ${node.y}, ${x} ${node.y}`}
            />
            <g className="apex-network-node" onClick={() => onSelectNode(node.id)} role="button" tabIndex={0}>
              <circle className="apex-node-ring" cx={x} cy={node.y} r="3.15" />
              <foreignObject height="4" pointerEvents="none" width="4" x={x - 2} y={node.y - 2}>
                <span className="apex-node-icon"><TacticalIcon name={node.icon} size={16} /></span>
              </foreignObject>
              <circle className={`apex-status-dot ${statusClass}`} cx={node.side === 'left' ? x - 2.25 : x + 2.25} cy={node.y + 2.25} r="0.7" />
              <text className="apex-node-label" textAnchor={textAnchor} x={textX} y={node.y + 0.6}>{node.label}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
