import type { ApprovalRequestData } from '../../window';
import { byId, errorMessage, esc } from '../dom';
import type { ApexHudApi, RunPhase } from '../types';
import { hideApprovalModal, showApprovalModal } from './approval';
import { appendLiveSettings } from './settings-panel';
import { createLiveSession } from './live-ui';
import { refreshHudSnapshot } from './snapshot';
import { updateWorkspaceContext, initProjectBridge } from './projects';

interface AgentMeta {
  node: string;
  label: string;
}

const AGENT_META: Record<string, AgentMeta> = {
  mentor: { node: 'mentor', label: 'Mentor' },
  coder: { node: 'coder', label: 'Coder' },
  designer: { node: 'designer', label: 'Designer' },
};

let pending = false;
let lastRunPhase: RunPhase | null = null;
const agentLabel = (name: string | null): string => (name ? AGENT_META[name]?.label ?? name : 'Core');

interface ResponseMeta {
  agentUsed?: string | null;
  intent?: string;
  elapsedMs?: number;
}

function isRunPhase(value: string): value is RunPhase {
  return ['IDLE', 'PLANNING', 'THINKING', 'AWAITING_APPROVAL', 'APPLYING_CHANGES',
    'VALIDATING', 'DONE', 'CANCELLED', 'ERROR'].includes(value);
}

function showRunPhase(app: ApexHudApi, phase: RunPhase, detail?: string): void {
  lastRunPhase = phase;
  const status = phase === 'CANCELLED' ? 'HALTED' : phase === 'IDLE' || phase === 'DONE' || phase === 'ERROR' ? 'IDLE' : 'THINKING';
  app.setCoreStatus(status);
  const label = byId<HTMLElement>('status-label');
  if (label) label.textContent = `STATUS: ${phase}`;
  app.addSystemLog('Orchestrator', detail ? `${phase}: ${detail}` : `Run phase: ${phase}`);
}

function showResponse(app: ApexHudApi, content: string, meta: ResponseMeta): void {
  const tags = [
    `<span class="ins-tag is-cyan">${esc(agentLabel(meta.agentUsed ?? null))}</span>`,
    `<span class="ins-tag is-amber">intent: ${esc(meta.intent ?? 'n/a')}</span>`,
    `<span class="ins-tag">${esc(meta.elapsedMs ?? 0)}ms</span>`,
  ].join('');
  const body = `<div class="ins-trace"><div class="ins-row" style="justify-content: flex-start; flex-wrap: wrap">${tags}</div><pre class="ins-pre">${esc(content)}</pre></div>`;
  app.openInspector('Core Response', 'LIVE AGENT OUTPUT', '#22D3EE', body);
}

async function dispatch(
  app: ApexHudApi,
  api: Window['api'],
  raw: string,
  quiet = false,
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
  lastRunPhase = null;
  app.setCoreStatus('THINKING');
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
    if (!quiet) showResponse(app, response.content, response);
    return response.content;
  } catch (error) {
    app.addSystemLog('Core', `IPC error: ${errorMessage(error)}`);
    app.showToast('IPC error');
    return null;
  } finally {
    pending = false;
    if (lastRunPhase !== 'CANCELLED') app.setCoreStatus('IDLE');
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
    dispatch(app, api, text, true),
  );

  app.addSystemLog('Orchestrator', 'Electron IPC bridge connected — live core online.');
  app.setCoreStatus('IDLE'); void app.refreshMemoryStats();

  api.onAgentActive((agent: string | null): void => {
    if (!agent) {
      app.setCoreStatus('IDLE');
      app.renderWings();
      return;
    }
    const nodeId = AGENT_META[agent]?.node;
    const node = nodeId ? app.agents.find((item) => item.id === nodeId) : undefined;
    if (node) {
      node.active = true;
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
