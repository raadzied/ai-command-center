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
  nameAr: string;
  role: string;
  icon: string;
  isActive: boolean;
}

type AgentNode = Node<AgentNodeData>;

const AGENTS: AgentNodeData[] = [
  { label: 'ORCHESTRATOR', nameAr: 'المنسق العام', role: 'تخطيط وتفكيك المهام DAG', icon: '🎯', isActive: false },
  { label: 'MENTOR', nameAr: 'المرشد', role: 'التحليل واستخلاص المهارات', icon: '🧠', isActive: false },
  { label: 'CODER', nameAr: 'المبرمج', role: 'كتابة الكود وفحص TypeScript', icon: '💻', isActive: false },
  { label: 'DESIGNER', nameAr: 'المصمم', role: 'هندسة الواجهات والتجربة', icon: '🎨', isActive: false },
];

function layout(): { nodes: AgentNode[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 70 });

  const nodeIds = ['orchestrator', 'mentor', 'coder', 'designer'];

  g.setNode('orchestrator', { width: 220, height: 90 });
  g.setNode('mentor', { width: 200, height: 90 });
  g.setNode('coder', { width: 200, height: 90 });
  g.setNode('designer', { width: 200, height: 90 });

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
    { id: 'e-o-m', source: 'orchestrator', target: 'mentor', animated: true, style: { stroke: '#00E5FF', strokeWidth: 2 } },
    { id: 'e-o-c', source: 'orchestrator', target: 'coder', animated: true, style: { stroke: '#00E676', strokeWidth: 2 } },
    { id: 'e-o-d', source: 'orchestrator', target: 'designer', animated: true, style: { stroke: '#FFAB40', strokeWidth: 2 } },
  ];

  return { nodes, edges };
}

function AgentNodeComponent({ data }: NodeProps) {
  const { label, nameAr, role, icon, isActive } = data as AgentNodeData;

  return (
    <motion.div
      animate={{
        boxShadow: isActive
          ? '0 0 28px rgba(0, 229, 255, 0.7), inset 0 0 14px rgba(0, 229, 255, 0.2)'
          : '0 4px 12px rgba(0,0,0,0.5)',
        borderColor: isActive ? '#00E5FF' : '#1E3A4C',
        scale: isActive ? 1.05 : 1,
      }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'rgba(13, 22, 34, 0.88)',
        backdropFilter: 'blur(12px)',
        border: '1px solid #1E3A4C',
        borderRadius: 12,
        padding: '14px 18px',
        minWidth: 190,
        textAlign: 'center',
        fontFamily: "'Consolas', monospace",
      }}
    >
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: 1,
        color: isActive ? '#00E5FF' : '#E0E6ED',
        marginBottom: 2,
      }}>
        {nameAr} · {label}
      </div>
      <div style={{ fontSize: 10, color: '#8A99AD', letterSpacing: 0.5, marginBottom: 6 }}>
        {role}
      </div>
      {isActive ? (
        <motion.div
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 10,
            color: '#00E5FF',
            fontWeight: 700,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5FF', boxShadow: '0 0 8px #00E5FF' }} />
          ⚡ يعالج الآن...
        </motion.div>
      ) : (
        <div style={{ fontSize: 9, color: '#4A5567', letterSpacing: 1 }}>متصل وجاهز</div>
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
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 10,
          background: 'rgba(13, 22, 34, 0.85)',
          backdropFilter: 'blur(8px)',
          color: '#E0E6ED',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 11,
          fontFamily: "'Consolas', monospace",
          display: 'flex',
          alignItem: 'center',
          gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ color: '#00E5FF', fontWeight: 700 }}>🕸️ خريطة شبكة الوكلاء الحية (DAG Topology)</span>
        <span style={{ color: '#4A5567' }}>|</span>
        <span style={{ color: taskInfo ? '#00E676' : '#8A99AD', fontWeight: 600 }}>
          {taskInfo ? `⚡ المهمة ${taskInfo.index}/${taskInfo.total}` : '🟢 جميع العقد متصلة وجاهزة'}
        </span>
      </div>

      <ReactFlow
        nodes={nodesWithActive}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#0A1220" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
