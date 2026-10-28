import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  NodeProps,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { motion } from 'framer-motion';

interface AgentMapProps {
  activeAgent: string | null;
  taskInfo: { index: number; total: number } | null;
}

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  role: string;
  icon: string;
  isActive: boolean;
}

type AgentNode = Node<AgentNodeData>;

const AGENTS: AgentNodeData[] = [
  { label: 'ORCHESTRATOR', role: 'Routing · Planning', icon: '◆', isActive: false },
  { label: 'MENTOR', role: 'Teaching · Explaining', icon: '◉', isActive: false },
  { label: 'CODER', role: 'Code · Debugging', icon: '▣', isActive: false },
  { label: 'DESIGNER', role: 'UI · Systems', icon: '◈', isActive: false },
];

// dagre layout
function layout(): { nodes: AgentNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

  const nodeIds = ['orchestrator', 'mentor', 'coder', 'designer'];

  g.setNode('orchestrator', { width: 200, height: 80 });
  g.setNode('mentor', { width: 160, height: 80 });
  g.setNode('coder', { width: 160, height: 80 });
  g.setNode('designer', { width: 160, height: 80 });

  g.setEdge('orchestrator', 'mentor');
  g.setEdge('orchestrator', 'coder');
  g.setEdge('orchestrator', 'designer');

  dagre.layout(g);

  const nodes: AgentNode[] = nodeIds.map((id, i) => {
    const pos = g.node(id);
    const data = AGENTS[i];
    if (!data) throw new Error('agent data missing');
    return {
      id,
      type: 'agent',
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
      data,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = [
    { id: 'e-o-m', source: 'orchestrator', target: 'mentor', animated: true, style: { stroke: '#1E3A4C', strokeWidth: 2 } },
    { id: 'e-o-c', source: 'orchestrator', target: 'coder', animated: true, style: { stroke: '#1E3A4C', strokeWidth: 2 } },
    { id: 'e-o-d', source: 'orchestrator', target: 'designer', animated: true, style: { stroke: '#1E3A4C', strokeWidth: 2 } },
  ];

  return { nodes, edges };
}

function AgentNodeComponent({ data }: NodeProps) {
  const { label, role, icon, isActive } = data as AgentNodeData;

  return (
    <motion.div
      animate={{
        boxShadow: isActive
          ? '0 0 24px rgba(0, 229, 255, 0.6), inset 0 0 12px rgba(0, 229, 255, 0.1)'
          : '0 0 0 rgba(0, 229, 255, 0)',
        borderColor: isActive ? '#00E5FF' : '#1E3A4C',
      }}
      transition={{ duration: 0.3 }}
      style={{
        background: '#0D1622',
        border: '1px solid #1E3A4C',
        borderRadius: 10,
        padding: '12px 16px',
        minWidth: 160,
        textAlign: 'center',
        fontFamily: "'Consolas', monospace",
      }}
    >
      <div style={{ fontSize: 20, color: isActive ? '#00E5FF' : '#4A5567', marginBottom: 4 }}>
        {icon}
      </div>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1.5,
        color: isActive ? '#00E5FF' : '#E0E6ED',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: '#8A99AD', letterSpacing: 0.5 }}>
        {role}
      </div>
      {isActive && (
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#00E5FF',
            margin: '6px auto 0',
            boxShadow: '0 0 8px #00E5FF',
          }}
        />
      )}
    </motion.div>
  );
}

const nodeTypes = { agent: AgentNodeComponent };

export function AgentMap({ activeAgent, taskInfo }: AgentMapProps): React.JSX.Element {
  const { nodes, edges } = useMemo(() => layout(), []);

  const nodesWithActive = useMemo<AgentNode[]>(
    () =>
      nodes.map((n) => {
        const isActive = activeAgent !== null && n.id === activeAgent;
        return { ...n, data: { ...n.data, isActive } };
      }),
    [nodes, activeAgent],
  );

  const onInit = useCallback(() => {
    // noop
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', direction: 'ltr', position: 'relative' }}>
      {taskInfo && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 10,
            background: '#0D1622',
            color: '#00E5FF',
            border: '1px solid #00E5FF',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontFamily: "'Consolas', monospace",
            fontWeight: 600,
            letterSpacing: 1,
            boxShadow: '0 0 16px rgba(0, 229, 255, 0.3)',
          }}
        >
          TASK {taskInfo.index}/{taskInfo.total}
        </motion.div>
      )}
      <ReactFlow
        nodes={nodesWithActive}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1A2634" gap={20} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
