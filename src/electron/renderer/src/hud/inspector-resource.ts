import { byId, esc } from './dom';
import { openInspectorPanel } from './inspector';
import type { ApexHudApi } from './types';

function memorySection(app: ApexHudApi): string {
  return `
    <div class="ins-trace">
      <div class="ins-row">
        <span class="ins-section-title">Retrieved Context Keys</span>
        <button id="insp-flush-mem" class="ins-btn is-danger" type="button">Flush Context</button>
      </div>
      <div class="ins-list">
        ${app.memoryEntries
          .map(
            (entry) => `
          <div class="ins-card" style="gap: 4px">
            <div class="ins-row">
              <span class="ins-key">${esc(entry.key)}</span>
              <span class="ins-score">sim ${esc(entry.score)}</span>
            </div>
            <div class="ins-val">${esc(entry.value)}</div>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
}

function mcpSection(app: ApexHudApi): string {
  return `
    <div class="ins-trace">
      <div class="ins-section-title">Connected MCP Servers</div>
      <div class="ins-list">
        ${app.mcpServers
          .map(
            (server) => `
          <div class="ins-list-item">
            <div>
              <div class="ins-value">${esc(server.name)}</div>
              <div class="ins-muted">Latency: ${esc(server.latency)}</div>
            </div>
            <button data-mcp-toggle="${esc(server.id)}" class="ins-btn ${server.enabled ? 'is-cyan' : ''}" style="flex: 0 0 auto; padding: 4px 10px" type="button">
              ${server.enabled ? 'ON' : 'OFF'}
            </button>
          </div>`,
          )
          .join('')}
      </div>
    </div>`;
}

function statusSection(app: ApexHudApi, pct: number): string {
  return `
    <div class="ins-card">
      <div class="ins-row"><span class="ins-label">STATUS</span><span class="ins-tag is-cyan">NOMINAL</span></div>
      <div class="ins-row"><span class="ins-label">LOAD</span><span class="ins-value">${pct}%</span></div>
      <div class="ins-row"><span class="ins-label">SYNC</span><span class="ins-value">REALTIME IPC</span></div>
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
    extra = memorySection(app);
  } else if (resource.type === 'mcp') {
    extra = mcpSection(app);
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

  byId<HTMLButtonElement>('insp-flush-mem')?.addEventListener('click', (): void => {
    const context = app.resources.find((item) => item.id === 'context');
    if (context) context.pct = 12;
    app.addSystemLog('SQLite Memory', 'Flushed ephemeral context window (100% -> 12%)');
    app.triggerBurst(1200);
    app.renderWings();
    app.openResourceInspector(id);
    app.showToast('Context window flushed');
  });

  document.querySelectorAll<HTMLButtonElement>('[data-mcp-toggle]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const serverId = button.dataset.mcpToggle;
      if (!serverId) return;
      const server = app.mcpServers.find((item) => item.id === serverId);
      if (!server) return;
      server.enabled = !server.enabled;
      const enabled = app.mcpServers.filter((item) => item.enabled).length;
      const mcp = app.resources.find((item) => item.id === 'mcp');
      if (mcp) mcp.pct = Math.round((enabled / app.mcpServers.length) * 20);
      app.addSystemLog('MCP Servers', `${server.name} ${server.enabled ? 'enabled' : 'disabled'}`);
      app.renderWings();
      app.openResourceInspector(id);
    });
  });
}

/** Core settings panel; the live Electron settings block is appended by the bridge. */
export function openSettingsInspector(app: ApexHudApi): void {
  const body = `
    <div class="ins-card">
      <div class="ins-section-title">Quick Simulation</div>
      <p class="ins-text">Fire a live multi-agent dispatch pulse to verify visual links and telemetry.</p>
      <button id="btn-sim-dispatch" class="ins-btn is-amber" type="button">Trigger Agent Dispatch Pulse</button>
    </div>

    <div class="ins-trace">
      <div class="ins-section-title">Core Shortcuts</div>
      <div class="ins-card" style="gap: 6px">
        <div class="ins-row"><span class="ins-muted">Voice Listening</span><span class="ins-key">Ctrl + Space</span></div>
        <div class="ins-row"><span class="ins-muted">Close Drawer</span><span class="ins-key">Escape</span></div>
        <div class="ins-row"><span class="ins-muted">Target Agent</span><span class="ins-score">@Coder / @Designer</span></div>
      </div>
    </div>`;

  openInspectorPanel('Core & MCP Settings', 'APEX SYSTEM CONFIG', '#38BDF8', body);

  byId<HTMLButtonElement>('btn-sim-dispatch')?.addEventListener('click', (): void => {
    if (app.state.coreStatus === 'HALTED') app.setCoreStatus('THINKING');
    const coder = app.agents.find((item) => item.id === 'coder');
    if (coder) coder.active = true;
    app.addSystemLog('Orchestrator', 'Dispatched live test pulse -> Coder & SQLite Memory');
    app.triggerBurst(2200);
    app.renderWings();
    app.showToast('Dispatch pulse fired to Coder & SQLite Memory');
  });
}
