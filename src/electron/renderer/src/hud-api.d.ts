// Shared HUD snapshot contract (renderer-side declaration).

export type NodeActivityState = 'idle' | 'active' | 'done' | 'error';

export interface HudActivityEvent {
  nodeId: string;
  state: NodeActivityState;
  detail?: string;
  ttlMs?: number;
}

export interface HudActivityApi {
  onHudActivity: (cb: (event: HudActivityEvent) => void) => () => void;
}

export interface HudMemorySnapshot {
  conversations: number;
  skills: number;
  decisions: number;
  sessions: number;
  dbSizeKb: number;
}

export interface HudContextSnapshot {
  recentMessages: number;
  activeSkills: number;
  hasProjectBrief: boolean;
}

export interface HudMcpSnapshot {
  total: number;
  connected: number;
  toolCount: number;
}

export interface HudFilesystemSnapshot {
  mode: 'daily' | 'workspace';
  rootPath: string | null;
  indexedFiles: number;
  maxFiles: number;
}

export interface HudTelemetrySnapshot {
  rssMb: number;
  heapMb: number;
  uptimeSec: number;
}

export interface HudSafetySnapshot {
  mode: 'planning' | 'build';
  pendingApproval: boolean;
}

export interface HudSnapshot {
  activeModel: { provider: string; model: string };
  memory: HudMemorySnapshot;
  context: HudContextSnapshot;
  mcp: HudMcpSnapshot;
  filesystem: HudFilesystemSnapshot;
  telemetry: HudTelemetrySnapshot;
  safety: HudSafetySnapshot;
}
