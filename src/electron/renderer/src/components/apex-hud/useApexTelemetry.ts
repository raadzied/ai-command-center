import { useCallback, useEffect, useRef, useState } from 'react';

export type ApexCoreState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';
export type ApexNodeId =
  | 'orchestrator' | 'mentor' | 'coder' | 'designer' | 'advisor' | 'browser'
  | 'terminal' | 'memory' | 'context' | 'mcp' | 'files' | 'voice' | 'telemetry';
export type ApexNodeStatus = 'idle' | 'active' | 'error';

export interface ApexMemoryStats {
  conversations: number;
  skills: number;
  projects: number;
  decisions: number;
}

export interface ApexTelemetry {
  activeNodes: Partial<Record<ApexNodeId, ApexNodeStatus>>;
  dispatchAgentPulse: (nodeId: ApexNodeId, status?: ApexNodeStatus) => void;
  lastOutput: string;
  memory: ApexMemoryStats | null;
  refreshMemory: () => Promise<void>;
  recordOutput: (content: string) => void;
  setCoreState: (state: ApexCoreState) => void;
  state: ApexCoreState;
  taskLabel: string | null;
}

const AGENT_TO_NODE: Record<string, ApexNodeId> = {
  mentor: 'mentor',
  coder: 'coder',
  designer: 'designer',
};

const EMPTY_STATUS: Partial<Record<ApexNodeId, ApexNodeStatus>> = {};

export function useApexTelemetry(): ApexTelemetry {
  const [state, setState] = useState<ApexCoreState>('IDLE');
  const [activeNodes, setActiveNodes] = useState(EMPTY_STATUS);
  const [lastOutput, setLastOutput] = useState('لا توجد مخرجات بعد.');
  const [memory, setMemory] = useState<ApexMemoryStats | null>(null);
  const [taskLabel, setTaskLabel] = useState<string | null>(null);
  const pulseTimers = useRef(new Map<ApexNodeId, number>());

  const dispatchAgentPulse = useCallback((nodeId: ApexNodeId, status: ApexNodeStatus = 'active'): void => {
    const existing = pulseTimers.current.get(nodeId);
    if (existing) window.clearTimeout(existing);
    setActiveNodes((current) => ({ ...current, [nodeId]: status }));
    if (status !== 'active') return;
    const timer = window.setTimeout(() => {
      setActiveNodes((current) => ({ ...current, [nodeId]: 'idle' }));
      pulseTimers.current.delete(nodeId);
    }, 2600);
    pulseTimers.current.set(nodeId, timer);
  }, []);

  const refreshMemory = useCallback(async (): Promise<void> => {
    try {
      setMemory(await window.api.getMemoryStats());
    } catch (error) {
      console.error('Unable to read APEX memory telemetry', error);
      setMemory(null);
    }
  }, []);

  useEffect(() => {
    void refreshMemory();
    const unsubscribeAgent = window.api.onAgentActive((agent) => {
      if (!agent) {
        setState('IDLE');
        return;
      }
      const nodeId = AGENT_TO_NODE[agent];
      if (nodeId) dispatchAgentPulse(nodeId);
      setState('THINKING');
    });
    const unsubscribeTask = window.api.onTaskStart(({ index, total }) => {
      setTaskLabel(`TASK ${index}/${total}`);
      dispatchAgentPulse('orchestrator');
      setState('THINKING');
    });
    const unsubscribeAudio = window.api.onVoiceAudio(() => {
      dispatchAgentPulse('voice');
      setState('SPEAKING');
    });
    const unsubscribeStop = window.api.onVoiceStop(() => setState('IDLE'));

    return () => {
      unsubscribeAgent();
      unsubscribeTask();
      unsubscribeAudio();
      unsubscribeStop();
      pulseTimers.current.forEach((timer) => window.clearTimeout(timer));
      pulseTimers.current.clear();
    };
  }, [dispatchAgentPulse, refreshMemory]);

  return {
    activeNodes,
    dispatchAgentPulse,
    lastOutput,
    memory,
    refreshMemory,
    recordOutput: (content: string): void => setLastOutput(content.slice(0, 1200)),
    setCoreState: setState,
    state,
    taskLabel,
  };
}
