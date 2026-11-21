import { createAudio } from './audio';
import { drawConstellationPaths } from './constellation';
import { AGENTS, MEMORY_ENTRIES, MCP_SERVERS, RESOURCES, SYSTEM_LOGS } from './data';
import { byId, clamp, errorMessage, formatTime } from './dom';
import {
  closeInspector as closeInspectorDrawer,
  openAgentInspector as showAgentInspector,
  openInspectorPanel,
  openTerminalInspector as showTerminalInspector,
} from './inspector';
import {
  openResourceInspector as showResourceInspector,
  openSettingsInspector as showSettingsInspector,
} from './inspector-resource';
import { renderWings as renderWingsView } from './wings';
import type {
  AgentNode,
  ApexAudioApi,
  ApexHudApi,
  CoreStatus,
  HudState,
  McpServer,
  MemoryEntry,
  ResourceNode,
  SystemLog,
} from './types';

/** Owns the HUD state and delegates rendering to the focused modules. */
export class ApexHud implements ApexHudApi {
  readonly state: HudState;
  readonly agents: AgentNode[];
  readonly resources: ResourceNode[];
  readonly mcpServers: McpServer[];
  readonly memoryEntries: MemoryEntry[];
  readonly systemLogs: SystemLog[];
  readonly audio: ApexAudioApi;
  private toastTimer: number | null = null;

  constructor() {
    this.state = {
      coreStatus: 'THINKING',
      previousStatus: 'THINKING',
      focusMode: false,
      burstUntil: 0,
      elapsedSeconds: 9 * 60 + 43,
      selectedNodeId: null,
    };
    this.agents = AGENTS.map((agent: AgentNode): AgentNode => ({ ...agent, logs: [...agent.logs] }));
    this.resources = RESOURCES.map((resource: ResourceNode): ResourceNode => ({ ...resource }));
    this.mcpServers = MCP_SERVERS.map((server: McpServer): McpServer => ({ ...server }));
    this.memoryEntries = MEMORY_ENTRIES.map((entry: MemoryEntry): MemoryEntry => ({ ...entry }));
    this.systemLogs = SYSTEM_LOGS.map((log: SystemLog): SystemLog => ({ ...log }));
    this.audio = createAudio();
  }

  formatTime(totalSeconds: number): string {
    return formatTime(totalSeconds);
  }

  addSystemLog(source: string, message: string): void {
    this.systemLogs.unshift({
      time: this.formatTime(this.state.elapsedSeconds),
      source,
      msg: message,
    });
    if (this.systemLogs.length > 40) this.systemLogs.pop();
  }

  showToast(message: string): void {
    const toast = byId<HTMLElement>('hud-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout((): void => {
      toast.classList.remove('is-visible');
      this.toastTimer = null;
    }, 2600);
  }

  setCoreStatus(status: CoreStatus): void {
    if (status !== 'HALTED') this.state.previousStatus = status;
    this.state.coreStatus = status;

    const label = byId<HTMLElement>('status-label');
    if (label) label.textContent = `STATUS: ${status}`;

    const dot = byId<HTMLElement>('status-dot');
    if (dot) dot.dataset.status = status;

    const voice = byId<HTMLElement>('btn-voice');
    if (voice) voice.classList.toggle('is-active', status === 'LISTENING');

    const kill = byId<HTMLButtonElement>('btn-kill');
    if (kill) {
      kill.textContent = status === 'HALTED' ? 'RESUME' : 'KILL ALL';
      kill.classList.toggle('is-resumed', status === 'HALTED');
    }

    const footer = byId<HTMLElement>('inspector-footer-status');
    if (footer) footer.textContent = status === 'HALTED' ? 'LINK: HALTED' : `LINK: ${status}`;

    this.applyFocusVisuals();
    this.renderWings();
  }

  triggerBurst(durationMs = 1800): void {
    this.state.burstUntil = performance.now() + durationMs;
    this.drawPaths();
    window.setTimeout((): void => {
      if (performance.now() >= this.state.burstUntil) this.drawPaths();
    }, durationMs + 60);
  }

  renderWings(): void {
    renderWingsView(this);
  }

  drawPaths(): void {
    drawConstellationPaths(this);
  }

  openInspector(title: string, subtitle: string, badge: string, body: string): void {
    openInspectorPanel(title, subtitle, badge, body);
  }

  closeInspector(): void {
    closeInspectorDrawer(this);
  }

  openAgentInspector(id: string): void {
    showAgentInspector(this, id);
  }

  openResourceInspector(id: string): void {
    showResourceInspector(this, id);
  }

  openTerminalInspector(): void {
    showTerminalInspector(this);
  }

  openSettingsInspector(): void {
    showSettingsInspector(this);
  }

  handleAgentClick(id: string): void {
    const agent = this.agents.find((item) => item.id === id);
    if (!agent) return;
    if (this.state.coreStatus !== 'HALTED') {
      agent.active = !agent.active;
      if (agent.active) this.audio.playDispatch();
      else this.audio.playClick(620);
      this.addSystemLog(agent.name, agent.active ? 'Dispatched by Orchestrator' : 'Switched to standby');
      this.triggerBurst(1500);
      this.renderWings();
    } else {
      this.audio.playClick(320);
    }
    this.openAgentInspector(id);
  }

  handleResourceClick(id: string): void {
    this.openResourceInspector(id);
  }

  async refreshMemoryStats(): Promise<void> {
    if (!window.api) return;
    try {
      const stats = await window.api.getMemoryStats();
      const total = stats.conversations + stats.decisions + stats.projects + stats.skills;
      const pct = clamp(Math.round((total / 2000) * 100), 1, 100);
      const sqlite = this.resources.find((resource) => resource.id === 'sqlite');
      if (sqlite) sqlite.pct = pct;
      this.memoryEntries.splice(
        0,
        this.memoryEntries.length,
        { key: 'db.conversations', value: String(stats.conversations), score: 'live' },
        { key: 'db.skills', value: String(stats.skills), score: 'live' },
        { key: 'db.decisions', value: String(stats.decisions), score: 'live' },
        { key: 'db.projects', value: String(stats.projects), score: 'live' },
      );
      this.renderWings();
    } catch (error) {
      this.addSystemLog('SQLite Memory', `Stats unavailable: ${errorMessage(error)}`);
    }
  }

  private applyFocusVisuals(): void {
    const dimmed = this.state.focusMode || this.state.coreStatus === 'LISTENING';
    byId<HTMLElement>('left-wing')?.classList.toggle('is-dimmed', dimmed);
    byId<HTMLElement>('right-wing')?.classList.toggle('is-dimmed', dimmed);
    byId<HTMLElement>('btn-focus')?.classList.toggle('is-active', this.state.focusMode);
  }
}
