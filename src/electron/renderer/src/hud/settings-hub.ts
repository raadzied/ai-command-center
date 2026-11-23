// Settings hub tab strip: SETTINGS · SKILLS · MCP inside the inspector drawer.

import { byId } from './dom';
import { openInspectorPanel } from './inspector';
import { appendLiveSettings } from './bridge/settings-panel';
import { renderSkillsPanel } from './bridge/skills-panel';
import { renderMcpPanel } from './bridge/mcp-panel';
import type { ApexHudApi } from './types';

export type SettingsTab = 'SETTINGS' | 'SKILLS' | 'MCP';

const TABS: readonly SettingsTab[] = ['SETTINGS', 'SKILLS', 'MCP'];

const QUICK_HTML = `
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

function wireQuickSettings(app: ApexHudApi): void {
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

function isTab(value: string | undefined): value is SettingsTab {
  return value === 'SETTINGS' || value === 'SKILLS' || value === 'MCP';
}

function renderTab(app: ApexHudApi, tab: SettingsTab, host: HTMLElement): void {
  if (tab === 'SETTINGS') {
    host.innerHTML = QUICK_HTML;
    wireQuickSettings(app);
    // Existing live settings block appends to #inspector-body when title matches.
    void appendLiveSettings(app, window.api);
    return;
  }
  if (tab === 'SKILLS') {
    void renderSkillsPanel(app, host);
    return;
  }
  void renderMcpPanel(app, host);
}

/** Opens (or reopens) the settings inspector with the requested tab active. */
export function openSettingsHub(app: ApexHudApi, tab: SettingsTab = 'SETTINGS'): void {
  const body = `
    <div class="hub-tabs" role="tablist">
      ${TABS.map((item: SettingsTab): string =>
        `<button type="button" role="tab" class="hub-tab ${item === tab ? 'is-active' : ''}" data-hub-tab="${item}" aria-selected="${item === tab}">${item}</button>`,
      ).join('')}
    </div>
    <div id="settings-tab-body" class="hub-tab-body"></div>`;
  openInspectorPanel('Core & MCP Settings', 'APEX SYSTEM CONFIG', '#38BDF8', body);

  document.querySelectorAll<HTMLButtonElement>('[data-hub-tab]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const value = button.dataset.hubTab;
      if (isTab(value)) openSettingsHub(app, value);
    });
  });

  const host = byId<HTMLElement>('settings-tab-body');
  if (host) renderTab(app, tab, host);
}
