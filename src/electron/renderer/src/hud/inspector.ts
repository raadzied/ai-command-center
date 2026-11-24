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

/** Read-only agent panel fed by real hud:activity events. */
export function openAgentInspector(app: ApexHudApi, id: string): void {
  const agent = app.agents.find((item) => item.id === id);
  if (!agent) return;

  app.state.selectedNodeId = id;
  const halted = app.state.coreStatus === 'HALTED';
  const status = halted ? 'HALTED' : agent.status.toUpperCase();
  const badge = status === 'ERROR' || status === 'HALTED'
    ? '#EF4444'
    : status === 'ACTIVE' ? '#F59E0B' : status === 'DONE' ? '#4ADE80' : '#94A3B8';
  const tag = status === 'ACTIVE' ? 'ins-tag is-amber' : 'ins-tag';
  const last = agent.lastActivity;
  const activity = last === undefined
    ? '<div class="ins-trace-line">No activity recorded</div>'
    : `<div class="ins-trace-line">${esc(new Date(last.at).toISOString().slice(11, 19))} - ${esc(last.detail)}</div>`;

  const body = `
    <div class="ins-card">
      <div class="ins-row">
        <span class="ins-label">Role</span>
        <span class="${tag}">${esc(status)}</span>
      </div>
      <div class="ins-value">${esc(agent.role)}</div>
      <p class="ins-text">${esc(agent.task)}</p>
    </div>

    <div class="ins-trace">
      <div class="ins-section-title">Last Activity</div>
      ${activity}
    </div>

    <div class="ins-trace">
      <div class="ins-section-title">Execution Trace</div>
      ${agent.logs.map((line: string) => `<div class="ins-trace-line">${esc(line)}</div>`).join('')}
    </div>`;

  openInspectorPanel(agent.name, 'SPECIALIST AGENT NODE', badge, body);
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
