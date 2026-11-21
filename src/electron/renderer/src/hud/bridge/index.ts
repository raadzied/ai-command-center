import type { ApprovalRequestData } from '../../window';
import { byId, errorMessage, esc } from '../dom';
import type { ApexHudApi } from '../types';
import { hideApprovalModal, showApprovalModal } from './approval';
import { appendLiveSettings } from './settings-panel';
import { createTtsPlayer } from './tts';
import { createVoiceRecorder } from './voice';

const AGENT_NODE_MAP: Record<string, string> = {
  mentor: 'advisor',
  coder: 'coder',
  designer: 'designer',
};

const AGENT_LABEL: Record<string, string> = {
  mentor: 'Mentor',
  coder: 'Coder',
  designer: 'Designer',
};

let pending = false;

function agentLabel(name: string | null): string {
  if (!name) return 'Core';
  return AGENT_LABEL[name] ?? name;
}

interface ResponseMeta {
  agentUsed?: string | null;
  intent?: string;
  elapsedMs?: number;
}

function showResponse(app: ApexHudApi, content: string, meta: ResponseMeta): void {
  const body = `
    <div class="ins-trace">
      <div class="ins-row" style="justify-content: flex-start; flex-wrap: wrap">
        <span class="ins-tag is-cyan">${esc(agentLabel(meta.agentUsed ?? null))}</span>
        <span class="ins-tag is-amber">intent: ${esc(meta.intent ?? 'n/a')}</span>
        <span class="ins-tag">${esc(meta.elapsedMs ?? 0)}ms</span>
      </div>
      <pre class="ins-pre">${esc(content)}</pre>
    </div>`;
  app.openInspector('Core Response', 'LIVE AGENT OUTPUT', '#22D3EE', body);
}

async function dispatch(app: ApexHudApi, api: Window['api'], raw: string): Promise<void> {
  if (pending) {
    app.showToast('Core is busy — wait for the current task');
    return;
  }

  const text = raw.replace(/^@\w+\s*/, '').trim();
  if (!text) return;

  const mention = raw.match(/^@(\w+)/i);
  if (mention) {
    const target = (mention[1] ?? '').toLowerCase();
    const node = app.agents.find(
      (agent) => agent.id.toLowerCase().includes(target) || agent.name.toLowerCase().includes(target),
    );
    if (node) {
      node.active = true;
      node.task = raw;
      node.logs.unshift(`Dispatched: ${raw}`);
      app.renderWings();
      app.triggerBurst(1800);
    }
  }

  pending = true;
  app.setCoreStatus('THINKING');
  app.addSystemLog('You', raw);
  app.showToast('Dispatched to core...');

  try {
    const response = await api.sendInput(text);
    if (response.ok && response.content) {
      const preview = response.content.replace(/\s+/g, ' ').slice(0, 140);
      app.addSystemLog(
        agentLabel(response.agentUsed ?? null),
        `${response.intent ?? 'chat'} · ${response.elapsedMs ?? 0}ms · ${preview}…`,
      );
      showResponse(app, response.content, response);
    } else {
      const message = response.error ?? 'Unknown error';
      app.addSystemLog('Core', `Error: ${message}`);
      app.showToast(`Core error: ${message.slice(0, 80)}`);
    }
  } catch (error) {
    app.addSystemLog('Core', `IPC error: ${errorMessage(error)}`);
    app.showToast('IPC error');
  } finally {
    pending = false;
    app.setCoreStatus('IDLE');
    app.renderWings();
    void app.refreshMemoryStats();
  }
}

/** Connects the HUD to the Electron preload bridge. No-op outside Electron. */
export function bindBridge(app: ApexHudApi): void {
  const api = window.api;
  if (!api) return;

  const tts = createTtsPlayer();
  const voice = createVoiceRecorder(app, api);

  app.addSystemLog('Orchestrator', 'Electron IPC bridge connected — live core online.');
  app.setCoreStatus('IDLE');
  void app.refreshMemoryStats();

  api.onAgentActive((agent: string | null): void => {
    if (!agent) {
      app.setCoreStatus('IDLE');
      app.renderWings();
      return;
    }
    const nodeId = AGENT_NODE_MAP[agent];
    if (nodeId) {
      const node = app.agents.find((item) => item.id === nodeId);
      if (node) {
        node.active = true;
        node.task = 'Executing live task...';
        node.logs.unshift(`Active · ${app.formatTime(app.state.elapsedSeconds)}`);
      }
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

  api.onApprovalRequest((request: ApprovalRequestData): void => {
    app.addSystemLog('Safety', `Approval requested: ${request.action.type} -> ${request.action.target}`);
    showApprovalModal(app, request);
  });

  api.onVoiceAudio((payload): void => {
    tts.push(payload);
  });
  api.onVoiceStop((): void => {
    tts.stop();
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
    void api.stopVoice().catch((error: unknown): void => {
      console.error('[apex-bridge] stopVoice failed', error);
    });
    tts.stop();
    app.addSystemLog('SAFETY', 'Voice playback stopped. Backend tasks keep their own state.');
  });

  byId<HTMLButtonElement>('btn-voice')?.addEventListener('click', (): void => {
    if (app.state.coreStatus === 'LISTENING') void voice.start();
    else voice.stop();
  });

  byId<HTMLButtonElement>('btn-settings')?.addEventListener('click', (): void => {
    window.setTimeout((): void => {
      void appendLiveSettings(app, api);
    }, 30);
  });

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hideApprovalModal();
  });
}
