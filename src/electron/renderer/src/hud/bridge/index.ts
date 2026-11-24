import type { ApprovalRequestData } from '../../window';
import { byId, errorMessage } from '../dom';
import type { ApexHudApi } from '../types';
import { hideApprovalModal, showApprovalModal } from './approval';
import { appendLiveSettings } from './settings-panel';
import { createLiveSession } from './live-ui';
import { refreshActiveModelLabel, refreshHudSnapshot } from './snapshot';
import { updateWorkspaceContext, initProjectBridge } from './projects';
import { agentNodeId, agentLabel } from './agent-meta';
import {
  getLastRunPhase, resetLastRunPhase, isRunPhase, showRunPhase,
} from './run-display';
import { bindConsultPulse } from './consult-pulse';
import { bindHudActivity } from './activity';
import { appendChatMessage, loadActiveSessionThread } from './chat-thread';

let pending = false;

async function dispatch(
  app: ApexHudApi,
  api: Window['api'],
  raw: string,
): Promise<string | null> {
  if (pending) {
    app.showToast('Core is busy — wait for the current task');
    return null;
  }

  const text = raw.replace(/^@\w+\s*/, '').trim();
  if (!text) return null;

  const target = (raw.match(/^@(\w+)/i)?.[1] ?? '').toLowerCase();
  const node = target
    ? app.agents.find(
        (agent) => agent.id.toLowerCase().includes(target) || agent.name.toLowerCase().includes(target),
      )
    : undefined;
  if (node) {
    node.active = true;
    node.task = raw;
    node.logs.unshift(`Dispatched: ${raw}`);
    app.renderWings();
    app.triggerBurst(1800);
  }

  pending = true;
  resetLastRunPhase();
  app.setCoreStatus('THINKING');
  appendChatMessage('user', text);
  app.addSystemLog('You', raw);
  app.showToast('Dispatched to core...');

  try {
    const response = await api.sendInput(text);
    if (!response.ok || !response.content) {
      const message = response.error ?? 'Unknown error';
      if (message === 'Run cancelled') {
        app.addSystemLog('SAFETY', 'Run cancelled by user.');
        app.showToast('Run cancelled');
        return null;
      }
      app.addSystemLog('Core', `Error: ${message}`);
      app.showToast(`Core error: ${message.slice(0, 80)}`);
      return null;
    }
    const preview = response.content.replace(/\s+/g, ' ').slice(0, 140);
    app.addSystemLog(
      agentLabel(response.agentUsed ?? null),
      `${response.intent ?? 'chat'} · ${response.elapsedMs ?? 0}ms · ${preview}…`,
    );
    appendChatMessage('agent', response.content, response.agentUsed ?? undefined);
    return response.content;
  } catch (error) {
    app.addSystemLog('Core', `IPC error: ${errorMessage(error)}`);
    app.showToast('IPC error');
    return null;
  } finally {
    pending = false;
    if (getLastRunPhase() !== 'CANCELLED') app.setCoreStatus('IDLE');
    refreshActiveModelLabel();
    app.renderWings(); void app.refreshMemoryStats(); void refreshHudSnapshot(app);
  }
}

/** Connects the HUD to the Electron preload bridge. No-op outside Electron. */
export function bindBridge(app: ApexHudApi): void {
  const api = window.api;
  if (!api) return;

  // Initialize workspace/project/session bridge
  initProjectBridge(app); updateWorkspaceContext(app);

  const session = createLiveSession(app, api, (text: string): Promise<string | null> =>
    dispatch(app, api, text),
  );

  void loadActiveSessionThread();
  app.addSystemLog('Orchestrator', 'Electron IPC bridge connected — live core online.');
  app.setCoreStatus('IDLE'); void app.refreshMemoryStats();

  api.onAgentActive((agent: string | null): void => {
    if (!agent) {
      for (const node of app.agents) {
        if (node.active) {
          node.active = false;
          node.status = 'idle';
        }
      }
      app.setCoreStatus('IDLE');
      app.renderWings();
      return;
    }
    const nodeId = agentNodeId(agent);
    const node = nodeId ? app.agents.find((item) => item.id === nodeId) : undefined;
    if (node) {
      node.active = true;
      node.status = 'active';
      node.task = 'Executing live task...';
      node.logs.unshift(`Active · ${app.formatTime(app.state.elapsedSeconds)}`);
    }
    app.setCoreStatus('THINKING');
    app.triggerBurst(1600);
    app.addSystemLog(agentLabel(agent), 'Agent active — executing task');
  });

  api.onTaskStart(({ index, total }): void => {
    app.addSystemLog('Orchestrator', `Task ${index}/${total} started`);
    app.showToast(`Task ${index}/${total} running...`);
    app.triggerBurst(1500);
  });

  bindConsultPulse(app, api);
  bindHudActivity(app, api);

  api.onRunPhase(({ phase, detail }): void => {
    if (isRunPhase(phase)) showRunPhase(app, phase, detail);
    else app.addSystemLog('Orchestrator', `Unknown run phase: ${phase}`);
  });

  api.onApprovalRequest((request: ApprovalRequestData): void => {
    app.addSystemLog('Safety', `Approval requested: ${request.action.type} -> ${request.action.target}`);
    showApprovalModal(app, request);
  });

  api.onVoiceAudio((payload): void => {
    session.pushAudio(payload);
    app.triggerBurst(2500);
  });
  api.onVoiceStop((): void => {
    session.stopPlayback();
  });

  document.addEventListener(
    'submit',
    (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement) || target.id !== 'command-form') return;
      const input = byId<HTMLInputElement>('command-input');
      const raw = input?.value.trim() ?? '';
      if (!raw || raw.startsWith('/')) return;
      event.preventDefault();
      event.stopPropagation();
      if (input) input.value = '';
      void dispatch(app, api, raw);
    },
    true,
  );

  byId<HTMLButtonElement>('btn-kill')?.addEventListener('click', (): void => {
    if (app.state.coreStatus !== 'HALTED') return;
    session.stopAudio();
    void api.cancelRun().then((result): void => {
      app.addSystemLog('SAFETY', result.cancelled ? 'Active run cancellation requested.' : 'No active run to cancel.');
    }).catch((error: unknown): void => {
      app.addSystemLog('SAFETY', `Cancellation failed: ${errorMessage(error)}`);
    });
  });

  byId<HTMLButtonElement>('btn-voice')?.addEventListener('click', (): void => {
    session.toggle();
  });

  byId<HTMLButtonElement>('btn-settings')?.addEventListener('click', (): void => {
    window.setTimeout((): void => {
      void appendLiveSettings(app, api);
    }, 30);
  });

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    hideApprovalModal();
    session.exit();
  });
}
