/** Shared contracts for the APEX HUD renderer. */

export type CoreStatus = 'THINKING' | 'LISTENING' | 'IDLE' | 'HALTED';

export type RunPhase =
  | 'IDLE' | 'PLANNING' | 'THINKING' | 'AWAITING_APPROVAL' | 'APPLYING_CHANGES'
  | 'VALIDATING' | 'DONE' | 'CANCELLED' | 'ERROR';

export type ResourceType = 'memory' | 'context' | 'mcp' | 'fs' | 'voice' | 'telemetry';

export type NodeStatus = 'idle' | 'active' | 'done' | 'error';

export interface AgentNode {
  id: string;
  name: string;
  active: boolean;
  status: NodeStatus;
  lastActivity?: { at: number; detail: string };
  icon: string;
  role: string;
  task: string;
  logs: string[];
}

export interface ResourceNode {
  id: string;
  name: string;
  pct: number;
  status: NodeStatus;
  lastActivity?: { at: number; detail: string };
  icon: string;
  type: ResourceType;
  desc: string;
}

export interface McpServer {
  id: string;
  name: string;
  enabled: boolean;
  latency: string;
}

export interface MemoryEntry {
  key: string;
  value: string;
  score: string;
}

export interface SystemLog {
  time: string;
  source: string;
  msg: string;
}

export interface HudState {
  coreStatus: CoreStatus;
  previousStatus: CoreStatus;
  focusMode: boolean;
  burstUntil: number;
  elapsedSeconds: number;
  selectedNodeId: string | null;
}

export interface ApexAudioApi {
  playClick(pitch?: number): void;
  playHover(): void;
  playBoot(): void;
  playDispatch(): void;
  playVoice(listening: boolean): void;
  playKill(): void;
  toggleEnabled(): boolean;
  unlockAndBootOnce(): void;
  isEnabled(): boolean;
}

export interface CoreController {
  disperse(): void;
  assemble(): void;
  pulse(): void;
}

/** Frame data shared by the canvas layers. */
export interface CoreFrame {
  time: number;
  speedMult: number;
  halted: boolean;
  listening: boolean;
  thinking: boolean;
  surge: number;
  flicker: number;
  integrity: number;
  disperse: number;
}

export interface ApexHudApi {
  readonly state: HudState;
  readonly agents: AgentNode[];
  readonly resources: ResourceNode[];
  readonly mcpServers: McpServer[];
  readonly memoryEntries: MemoryEntry[];
  readonly systemLogs: SystemLog[];
  readonly audio: ApexAudioApi;
  addSystemLog(source: string, message: string): void;
  showToast(message: string): void;
  setCoreStatus(status: CoreStatus): void;
  triggerBurst(durationMs?: number): void;
  renderWings(): void;
  drawPaths(): void;
  openInspector(title: string, subtitle: string, badge: string, body: string): void;
  closeInspector(): void;
  openAgentInspector(id: string): void;
  openResourceInspector(id: string): void;
  openTerminalInspector(): void;
  openSettingsInspector(): void;
  handleAgentClick(id: string): void;
  handleResourceClick(id: string): void;
  refreshMemoryStats(): Promise<void>;
  formatTime(totalSeconds: number): string;
}
