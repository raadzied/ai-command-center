import type { AssistantMode, AssistantPermission, AssistantSettings } from '../../window';
import { byId, errorMessage } from '../dom';
import type { ApexHudApi } from '../types';

type RendererApi = Window['api'];

const PERMISSIONS: AssistantPermission[] = [
  'file_read',
  'file_write',
  'file_delete',
  'terminal',
  'http_request',
  'git_operation',
  'mcp_tool',
];

async function changeMode(
  app: ApexHudApi,
  api: RendererApi,
  mode: AssistantMode,
  section: HTMLElement,
): Promise<void> {
  try {
    await api.setAssistantMode(mode);
    app.addSystemLog('Core Settings', `Mode -> ${mode}`);
    app.showToast(`Mode: ${mode}`);
    section.remove();
    await appendLiveSettings(app, api);
  } catch (error) {
    app.showToast(`Mode change failed: ${errorMessage(error)}`);
  }
}

async function changePermission(
  app: ApexHudApi,
  api: RendererApi,
  permission: AssistantPermission,
  enabled: boolean,
  section: HTMLElement,
): Promise<void> {
  try {
    await api.setPermission(permission, enabled);
    app.addSystemLog('Core Settings', `${permission} -> ${enabled ? 'ON' : 'OFF'}`);
    app.showToast(`${permission}: ${enabled ? 'ON' : 'OFF'}`);
    section.remove();
    await appendLiveSettings(app, api);
  } catch (error) {
    app.showToast(`Permission change failed: ${errorMessage(error)}`);
  }
}

/** Appends the real assistant mode / permission controls to the settings inspector. */
export async function appendLiveSettings(app: ApexHudApi, api: RendererApi): Promise<void> {
  const body = byId<HTMLElement>('inspector-body');
  if (!body || body.querySelector('#bridge-real-settings')) return;

  let settings: AssistantSettings;
  try {
    settings = await api.getAssistantSettings();
  } catch (error) {
    app.addSystemLog('Core Settings', `Settings unavailable: ${errorMessage(error)}`);
    return;
  }

  const title = byId<HTMLElement>('inspector-title');
  if (!title || title.textContent !== 'Core & MCP Settings') return;

  const section = document.createElement('div');
  section.id = 'bridge-real-settings';
  section.className = 'ins-trace';
  section.innerHTML = `
    <div class="ins-section-title">Live Core Settings</div>
    <div class="ins-card" style="gap: 10px">
      <div class="ins-row">
        <span class="ins-muted">Assistant Mode</span>
        <div style="display: flex; gap: 4px">
          <button data-mode="planning" class="ins-btn ${settings.mode === 'planning' ? 'is-amber' : ''}" style="flex: 0 0 auto; padding: 4px 10px" type="button">Planning</button>
          <button data-mode="build" class="ins-btn ${settings.mode === 'build' ? 'is-cyan' : ''}" style="flex: 0 0 auto; padding: 4px 10px" type="button">Build</button>
        </div>
      </div>
      ${PERMISSIONS.map(
        (permission: AssistantPermission) => `
        <div class="ins-row">
          <span class="ins-key">${permission}</span>
          <button data-perm="${permission}" class="ins-btn ${settings.permissions[permission] ? 'is-cyan' : ''}" style="flex: 0 0 auto; padding: 4px 10px" type="button">
            ${settings.permissions[permission] ? 'ON' : 'OFF'}
          </button>
        </div>`,
      ).join('')}
    </div>`;
  body.appendChild(section);

  section.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const mode = button.dataset.mode;
      if (mode !== 'planning' && mode !== 'build') return;
      void changeMode(app, api, mode, section);
    });
  });

  section.querySelectorAll<HTMLButtonElement>('[data-perm]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const permission = PERMISSIONS.find((item) => item === button.dataset.perm);
      if (!permission) return;
      const enabled = button.textContent?.trim() !== 'ON';
      void changePermission(app, api, permission, enabled, section);
    });
  });
}
