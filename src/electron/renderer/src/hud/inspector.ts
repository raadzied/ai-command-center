import { byId, esc } from './dom';
import type { ApexHudApi } from './types';

/** Opens the slide-over drawer and swaps its content. */
export function openInspectorPanel(title: string, subtitle: string, badge: string, body: string): void {
  const drawer = byId<HTMLElement>('inspector-drawer');
  const titleElement = byId<HTMLElement>('inspector-title');
  const subtitleElement = byId<HTMLElement>('inspector-subtitle');
  const badgeElement = byId<HTMLElement>('inspector-badge');
  const bodyElement = byId<HTMLElement>('inspector-body');
  if (!drawer || !titleElement || !subtitleElement || !badgeElement || !bodyElement) return;

  titleElement.textContent = title;
  subtitleElement.textContent = subtitle;
  badgeElement.style.backgroundColor = badge;
  badgeElement.style.boxShadow = `0 0 8px ${badge}`;
  bodyElement.innerHTML = body;
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
}

export function closeInspector(app: ApexHudApi): void {
  const drawer = byId<HTMLElement>('inspector-drawer');
  if (drawer) {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  app.state.selectedNodeId = null;
}

/** Agent telemetry panel with pause / activate and ping actions. */
export function openAgentInspector(app: ApexHudApi, id: string): void {
  const agent = app.agents.find((item) => item.id === id);
  if (!agent) return;

  app.state.selectedNodeId = id;
  const halted = app.state.coreStatus === 'HALTED';
  const badge = halted ? '#EF4444' : agent.active ? '#F59E0B' : '#94A3B8';
  const tag = agent.active && !halted ? 'ins-tag is-amber' : 'ins-tag';
  const stateLabel = halted ? 'HALTED' : agent.active ? 'ACTIVE' : 'STANDBY';

  const body = `
    <div class="ins-card">
      <div class="ins-row">
        <span class="ins-label">Role</span>
        <span class="${tag}">${stateLabel}</span>
      </div>
      <div class="ins-value">${esc(agent.role)}</div>
      <p class="ins-text">${esc(agent.task)}</p>
    </div>

    <div class="ins-actions">
      <button id="insp-toggle-agent" class="ins-btn ${agent.active ? 'is-amber' : 'is-cyan'}" type="button">
        ${agent.active ? 'Pause Agent' : 'Activate Agent'}
      </button>
      <button id="insp-pulse-agent" class="ins-btn" type="button">Ping</button>
    </div>

    <div class="ins-trace">
      <div class="ins-section-title">Agent Execution Trace</div>
      ${agent.logs.map((line: string) => `<div class="ins-trace-line">${esc(line)}</div>`).join('')}
    </div>`;

  openInspectorPanel(agent.name, 'SPECIALIST AGENT NODE', badge, body);

  const toggle = byId<HTMLButtonElement>('insp-toggle-agent');
  if (toggle) {
    toggle.addEventListener('click', (): void => {
      if (app.state.coreStatus === 'HALTED') {
        app.showToast('System halted. Resume core first.');
        return;
      }
      agent.active = !agent.active;
      app.addSystemLog(agent.name, agent.active ? 'Activated via Inspector' : 'Placed on standby');
      app.triggerBurst(1200);
      app.renderWings();
      app.openAgentInspector(id);
    });
  }

  const ping = byId<HTMLButtonElement>('insp-pulse-agent');
  if (ping) {
    ping.addEventListener('click', (): void => {
      if (!agent.active && app.state.coreStatus !== 'HALTED') agent.active = true;
      agent.logs.unshift(`Heartbeat verified [${app.formatTime(app.state.elapsedSeconds)}]`);
      app.addSystemLog(agent.name, 'Neural link ping acknowledged (4ms)');
      app.triggerBurst(1600);
      app.renderWings();
      app.openAgentInspector(id);
      app.showToast(`Pulse dispatched to ${agent.name}`);
    });
  }
}

/** Live orchestrator event stream. */
export function openTerminalInspector(app: ApexHudApi): void {
  const body = `
    <div class="ins-trace">
      <div class="ins-section-title">Live Orchestrator Event Stream</div>
      ${app.systemLogs
        .map(
          (log) => `
        <div class="ins-card" style="gap: 4px">
          <div class="ins-row">
            <span class="ins-key">${esc(log.source)}</span>
            <span class="ins-muted">${esc(log.time)}</span>
          </div>
          <div class="ins-val">${esc(log.msg)}</div>
        </div>`,
        )
        .join('')}
    </div>`;

  openInspectorPanel('Live Execution Log', 'SYSTEM TELEMETRY STREAM', '#38BDF8', body);
}
