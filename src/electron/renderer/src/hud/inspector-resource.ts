import { esc } from './dom';
import { openInspectorPanel } from './inspector';
import { openSettingsHub } from './settings-hub';
import { openFileSystemInspector } from './bridge/fs-panel';
import { getCachedSnapshot } from './bridge/snapshot';
import type { ApexHudApi } from './types';

function memorySection(): string {
  const snap = getCachedSnapshot();
  const memory = snap?.memory;
  const context = snap?.context;
  return `
    <div class="ins-trace">
      <div class="ins-section-title">Live SQLite Store</div>
      <div class="ins-card" style="gap: 6px">
        <div class="ins-row"><span class="ins-muted">Conversations</span><span class="ins-value">${memory?.conversations ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Memory Skills</span><span class="ins-value">${memory?.skills ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Decisions</span><span class="ins-value">${memory?.decisions ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Sessions</span><span class="ins-value">${memory?.sessions ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Database Size</span><span class="ins-value">${memory?.dbSizeKb ?? 0} KB</span></div>
      </div>
      <div class="ins-section-title">Live Context Components</div>
      <div class="ins-card" style="gap: 6px">
        <div class="ins-row"><span class="ins-muted">Recent Messages</span><span class="ins-value">${context?.recentMessages ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Active Skills</span><span class="ins-value">${context?.activeSkills ?? 0}</span></div>
        <div class="ins-row"><span class="ins-muted">Project Brief</span><span class="ins-value">${context === undefined ? 'n/a' : context.hasProjectBrief ? 'READY' : 'MISSING'}</span></div>
      </div>
    </div>`;
}

function telemetrySection(app: ApexHudApi): string {
  const snap = getCachedSnapshot();
  const t = snap?.telemetry;
  const safety = snap?.safety;
  return `
    <div class="ins-card" style="gap: 6px">
      <div class="ins-row"><span class="ins-muted">RSS RAM MB</span><span class="ins-value">${t?.rssMb ?? 0}</span></div>
      <div class="ins-row"><span class="ins-muted">Heap MB</span><span class="ins-value">${t?.heapMb ?? 0}</span></div>
      <div class="ins-row"><span class="ins-muted">Uptime</span><span class="ins-value">${t === undefined ? '0s' : app.formatTime(t.uptimeSec)}</span></div>
      <div class="ins-row"><span class="ins-muted">Safety Mode</span><span class="ins-value">${esc(safety?.mode ?? 'n/a')}</span></div>
      <div class="ins-row"><span class="ins-muted">Pending Approval</span><span class="ins-value">${safety?.pendingApproval === true ? 'YES' : 'NO'}</span></div>
    </div>`;
}

function statusSection(app: ApexHudApi, pct: number): string {
  return `
    <div class="ins-card">
      <div class="ins-row"><span class="ins-label">STATUS</span><span class="ins-tag is-cyan">LIVE IPC</span></div>
      <div class="ins-row"><span class="ins-label">LOAD</span><span class="ins-value">${pct}%</span></div>
      <div class="ins-row"><span class="ins-label">EVENTS</span><span class="ins-value">${app.systemLogs.length}</span></div>
    </div>`;
}

/** Resource / memory inspector. */
export function openResourceInspector(app: ApexHudApi, id: string): void {
  const resource = app.resources.find((item) => item.id === id);
  if (!resource) return;

  app.state.selectedNodeId = id;
  const pct = Math.max(0, Math.min(100, Math.round(resource.pct)));
  let extra = statusSection(app, pct);
  if (resource.type === 'memory' || resource.type === 'context') {
    extra = memorySection();
  } else if (resource.type === 'telemetry') {
    extra = telemetrySection(app);
  } else if (resource.type === 'fs') {
    openFileSystemInspector(app);
    return;
  } else if (resource.type === 'mcp') {
    openSettingsHub(app, 'MCP');
    return;
  }

  const body = `
    <div class="ins-card">
      <span class="ins-text">${esc(resource.desc)}</span>
      <div class="ins-row">
        <div class="ins-progress"><div class="ins-progress-fill" style="width: ${pct}%"></div></div>
        <span class="ins-key">${pct}%</span>
      </div>
    </div>
    ${extra}`;

  openInspectorPanel(resource.name, 'SYSTEM RESOURCE NODE', '#38BDF8', body);
}

/** Core settings panel — delegates to the shared three-tab settings hub. */
export function openSettingsInspector(app: ApexHudApi): void {
  openSettingsHub(app, 'SETTINGS');
}
