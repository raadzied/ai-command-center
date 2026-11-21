import { byId, clamp, esc } from './dom';
import type { AgentNode, ApexHudApi, ResourceNode } from './types';

const LEFT_ARC = [28, 10, 0, 0, 10, 28];
const LEFT_ARC_COMPACT = [10, 4, 0, 0, 4, 10];
const RIGHT_ARC = [-28, -10, 0, 0, -10, -28];
const RIGHT_ARC_COMPACT = [-10, -4, 0, 0, -4, -10];

function agentRow(agent: AgentNode, halted: boolean, offset: number): string {
  const circle = halted ? 'node-halted' : agent.active ? 'node-agent-active' : 'node-agent-idle';
  const label = agent.active && !halted ? '' : ' is-idle';
  return `
    <div class="node-row" data-agent-id="${esc(agent.id)}" style="transform: translateX(${offset}px)">
      <span class="node-label${label}">${esc(agent.name)}</span>
      <div id="node-circle-${esc(agent.id)}" class="node-circle ${circle}">${agent.icon}</div>
    </div>`;
}

function resourceRow(resource: ResourceNode, halted: boolean, offset: number): string {
  const pct = clamp(Math.round(resource.pct), 0, 100);
  return `
    <div class="node-row" data-resource-id="${esc(resource.id)}" style="transform: translateX(${offset}px)">
      <div id="node-circle-${esc(resource.id)}" class="node-circle ${halted ? 'node-halted' : 'node-resource'}">${resource.icon}</div>
      <div class="node-meta">
        <span class="node-label">${esc(resource.name)}</span>
        <div class="res-line">
          <div class="res-bar-track"><div class="res-bar-fill" style="width: ${pct}%"></div></div>
          <span class="res-pct">${pct}%</span>
        </div>
      </div>
    </div>`;
}

/** Rebuilds both wings and reattaches their interactions. */
export function renderWings(app: ApexHudApi): void {
  const left = byId<HTMLElement>('left-wing');
  const right = byId<HTMLElement>('right-wing');
  if (!left || !right) return;

  const compact = window.innerWidth < 960 || window.innerHeight < 560;
  const leftArc = compact ? LEFT_ARC_COMPACT : LEFT_ARC;
  const rightArc = compact ? RIGHT_ARC_COMPACT : RIGHT_ARC;
  const halted = app.state.coreStatus === 'HALTED';

  left.innerHTML = app.agents
    .map((agent: AgentNode, index: number) => agentRow(agent, halted, leftArc[index] ?? 0))
    .join('');
  right.innerHTML = app.resources
    .map((resource: ResourceNode, index: number) => resourceRow(resource, halted, rightArc[index] ?? 0))
    .join('');

  const activeCount = halted ? 0 : app.agents.filter((agent: AgentNode) => agent.active).length;
  const badge = byId<HTMLElement>('active-agents-count');
  if (badge) badge.textContent = `AGENTS: ${activeCount}/${app.agents.length} ACTIVE`;

  left.querySelectorAll<HTMLElement>('[data-agent-id]').forEach((row: HTMLElement): void => {
    row.addEventListener('mouseenter', (): void => app.audio.playHover());
    row.addEventListener('click', (): void => {
      const id = row.dataset.agentId;
      if (id) app.handleAgentClick(id);
    });
  });

  right.querySelectorAll<HTMLElement>('[data-resource-id]').forEach((row: HTMLElement): void => {
    row.addEventListener('mouseenter', (): void => app.audio.playHover());
    row.addEventListener('click', (): void => {
      const id = row.dataset.resourceId;
      if (!id) return;
      app.audio.playClick(860);
      app.handleResourceClick(id);
    });
  });

  window.requestAnimationFrame((): void => app.drawPaths());
}
