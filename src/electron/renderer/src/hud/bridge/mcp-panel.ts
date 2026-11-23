// MCP tab: live server status, per-project ON/OFF and an inline add form.

import { esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { McpAddInput, McpView, McpsResult } from '../../window';

const PLUS_SVG =
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;
const CLOSE_SVG =
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>`;

let cachedServers: McpView[] = [];
let showForm = false;

function reportError(app: ApexHudApi, result: McpsResult): boolean {
  if (result.ok) return true;
  app.showToast(result.error ?? 'MCP action failed');
  return false;
}

function statusLabel(server: McpView): string {
  if (server.status === 'connected') return 'CONNECTED';
  return server.status === 'error' ? 'ERROR' : 'STOPPED';
}

function serverCard(server: McpView): string {
  const label = statusLabel(server);
  return `
    <div class="hub-card" data-mcp-card="${server.id}">
      <div class="hub-card-top">
        <span class="hub-name" dir="auto">${esc(server.name)}</span>
        <span class="hub-card-actions">
          <span class="hub-status-dot is-${server.status}" title="${label}"></span>
          <button type="button" class="hub-icon-btn" data-mcp-remove="${server.id}" title="Remove server" aria-label="Remove server">${CLOSE_SVG}</button>
        </span>
      </div>
      <div class="hub-card-foot">
        <span class="hub-muted">${label} - ${server.toolCount} tools</span>
        <button type="button" class="hub-toggle ${server.effectiveEnabled ? 'is-on' : ''}"
          data-mcp-toggle="${server.id}" aria-pressed="${server.effectiveEnabled}">${server.effectiveEnabled ? 'ON' : 'OFF'}</button>
      </div>
      ${server.error === undefined ? '' : `<p class="hub-desc is-error" dir="auto">${esc(server.error)}</p>`}
      ${server.tools.length === 0 ? '' : `<p class="hub-muted">${esc(server.tools.join(', '))}</p>`}
    </div>`;
}

function addForm(): string {
  return `
    <div class="hub-card">
      <div class="hub-section-head">
        <span class="hub-title">ADD MCP SERVER</span>
        <button type="button" class="hub-icon-btn" data-mcp-cancel title="Close form" aria-label="Close form">${CLOSE_SVG}</button>
      </div>
      <label class="hub-field">Name<input id="mcp-name" type="text" maxlength="60" autocomplete="off" /></label>
      <label class="hub-field">Arguments (space separated)<input id="mcp-args" type="text" maxlength="300" autocomplete="off" /></label>
      <label class="hub-field">Secret reference (env name, optional)<input id="mcp-secret" type="text" maxlength="60" autocomplete="off" /></label>
      <button type="button" class="hub-add" data-mcp-submit>${PLUS_SVG} Save server</button>
      <p class="hub-muted">A file picker will ask for the server's JavaScript entry point.</p>
    </div>`;
}

function draw(host: HTMLElement): void {
  const list = cachedServers.length === 0
    ? '<div class="hub-empty">No MCP servers registered yet.</div>'
    : `<div class="hub-list">${cachedServers.map(serverCard).join('')}</div>`;
  host.innerHTML = `
    <div class="hub-section-head">
      <span class="hub-title">MCP SERVERS</span>
      <button type="button" class="hub-add" data-mcp-add title="Add MCP server" aria-label="Add MCP server">${PLUS_SVG} Add MCP</button>
    </div>
    ${showForm ? addForm() : ''}
    ${list}`;
}

function readForm(host: HTMLElement): McpAddInput | null {
  const name = host.querySelector<HTMLInputElement>('#mcp-name')?.value.trim() ?? '';
  if (name.length < 2) return null;
  const rawArgs = host.querySelector<HTMLInputElement>('#mcp-args')?.value.trim() ?? '';
  const secretRef = host.querySelector<HTMLInputElement>('#mcp-secret')?.value.trim() ?? '';
  return {
    name,
    ...(rawArgs === '' ? {} : { args: rawArgs.split(/\s+/).slice(0, 32) }),
    ...(secretRef === '' ? {} : { secretRef }),
  };
}

/** Fetches and renders MCP servers into the given host, then wires actions. */
export async function renderMcpPanel(app: ApexHudApi, host: HTMLElement): Promise<void> {
  let result: McpsResult;
  try {
    result = await window.api.listMcps();
  } catch (err) {
    app.showToast(`MCP unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!reportError(app, result)) return;
  cachedServers = result.servers;
  draw(host);
  host.onclick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const toggle = target.closest<HTMLElement>('[data-mcp-toggle]');
    if (toggle) {
      const id = Number(toggle.dataset['mcpToggle']);
      const enabled = toggle.textContent?.trim() !== 'ON';
      if (!Number.isNaN(id)) void update(app, host, window.api.toggleMcp(id, enabled));
      return;
    }
    const item = toggle ?? target.closest<HTMLElement>('[data-mcp-card]');
    if (item !== null && item.dataset['mcpCard'] !== undefined) {
      const id = Number(item.dataset['mcpCard']);
      if (target.closest('[data-mcp-remove]') && !Number.isNaN(id)) {
        void update(app, host, window.api.removeMcp(id));
      }
      return;
    }
    if (target.closest('[data-mcp-add]')) {
      showForm = true;
      draw(host);
      return;
    }
    if (target.closest('[data-mcp-cancel]')) {
      showForm = false;
      draw(host);
      return;
    }
    if (target.closest('[data-mcp-submit]')) {
      const details = readForm(host);
      if (details === null) {
        app.showToast('Server name is required');
        return;
      }
      void update(app, host, window.api.addMcp(details));
    }
  };
}

async function update(app: ApexHudApi, host: HTMLElement, action: Promise<McpsResult>): Promise<void> {
  let result: McpsResult;
  try {
    result = await action;
  } catch (err) {
    app.showToast(`MCP action failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!reportError(app, result)) return;
  showForm = false;
  cachedServers = result.servers;
  app.showToast('MCP servers updated');
  await renderMcpPanel(app, host);
}
