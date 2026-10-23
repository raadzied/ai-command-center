import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

interface AgentMapProps {
  activeAgent: string | null;
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 180;
const nodeHeight = 60;

const initialNodes: Node[] = [
  { id: 'orchestrator', position: { x: 0, y: 0 }, data: { label: 'Orchestrator (Core)' } },
  { id: 'mentor', position: { x: 0, y: 0 }, data: { label: 'Mentor (Learn)' } },
  { id: 'coder', position: { x: 0, y: 0 }, data: { label: 'Coder (Build)' } },
  { id: 'designer', position: { x: 0, y: 0 }, data: { label: 'Designer (UI/UX)' } },
];

const initialEdges: Edge[] = [
  { id: 'e-orch-mentor', source: 'orchestrator', target: 'mentor' },
  { id: 'e-orch-coder', source: 'orchestrator', target: 'coder' },
  { id: 'e-orch-designer', source: 'orchestrator', target: 'designer' },
];

function getLayoutedElements(nodes: Node[], nodesActive: string | null): { nodes: Node[]; edges: Edge[] } {
  dagreGraph.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 50 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  initialEdges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const isActive = nodesActive === node.id || (nodesActive === 'orchestrator' && node.id === 'orchestrator');
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
      style: {
        background: '#0D1622',
        color: '#E0E6ED',
        border: isActive ? '2px solid #00E5FF' : '1px solid #1E3A4C',
        borderRadius: '8px',
        padding: '10px',
        fontSize: '13px',
        fontWeight: 600,
        textAlign: 'center' as const,
        boxShadow: isActive ? '0 0 20px rgba(0, 229, 255, 0.4)' : 'none',
      },
    };
  });

  const layoutedEdges = initialEdges.map((edge) => {
    const isTargetActive = nodesActive === edge.target;
    return {
      ...edge,
      animated: isTargetActive,
      style: { stroke: isTargetActive ? '#00E5FF' : '#1A2634', strokeWidth: 2 },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}

export function AgentMap({ activeAgent }: AgentMapProps): React.JSX.Element {
  const { nodes, edges } = useMemo(() => getLayoutedElements(initialNodes, activeAgent), [activeAgent]);

  return (
    <div style={{ width: '100%', height: '100%', direction: 'ltr', background: '#060B11' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
        style={{ width: '100%', height: '100%' }}
      >
        <Background gap={16} size={1} color="#1A2634" />
        <Controls />
      </ReactFlow>
    </div>
  );
}
