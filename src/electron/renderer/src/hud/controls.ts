import { byId } from './dom';
import { openChatThread } from './bridge/chat-thread';
import type { ApexHudApi, CoreController, CoreStatus } from './types';

/** Wires every dock control, the clock, the command form and keyboard shortcuts. */
export function bindControls(app: ApexHudApi, core: CoreController): void {
  const clock = byId<HTMLElement>('hud-clock');
  const pad = (value: number): string => String(value).padStart(2, '0');

  const tickClock = (): void => {
    const now = new Date();
    app.state.elapsedSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (clock) {
      clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
  };
  tickClock();
  window.setInterval(tickClock, 1000);

  const unlock = (): void => {
    app.audio.unlockAndBootOnce();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  byId<HTMLButtonElement>('status-toggle')?.addEventListener('click', (): void => {
    const order: CoreStatus[] = ['THINKING', 'LISTENING', 'IDLE'];
    const index = order.indexOf(app.state.coreStatus);
    const next = order[(index + 1) % order.length] ?? 'THINKING';
    app.audio.playClick(980);
    app.setCoreStatus(next);
    app.addSystemLog('Sentient Core', `Core mode switched to ${next}`);
  });

  const pulseCore = (): void => {
    if (app.state.coreStatus === 'HALTED') {
      app.audio.playClick(300);
      app.showToast('Core is halted. Click RESUME to reactivate.');
      return;
    }
    app.audio.playDispatch();
    core.pulse();
    app.triggerBurst(2200);
    app.addSystemLog('Sentient Core', 'Manual neural synchronization pulse emitted.');
    app.showToast('Neural core pulse synchronized');
  };

  const hitbox = byId<HTMLElement>('core-hitbox');
  hitbox?.addEventListener('click', pulseCore);
  hitbox?.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pulseCore();
    }
  });

  byId<HTMLButtonElement>('btn-audio-toggle')?.addEventListener('click', (): void => {
    const enabled = app.audio.toggleEnabled();
    const label = byId<HTMLElement>('audio-label');
    if (label) label.textContent = enabled ? 'SFX: ON' : 'SFX: OFF';
    byId<HTMLElement>('audio-dot')?.classList.toggle('is-off', !enabled);
    app.showToast(enabled ? 'Tactical audio enabled' : 'Tactical audio muted');
  });

  byId<HTMLButtonElement>('btn-boot-sound')?.addEventListener('click', (): void => {
    if (app.state.coreStatus === 'HALTED') app.setCoreStatus('THINKING');
    app.audio.playBoot();
    core.assemble();
    app.triggerBurst(2400);
    app.addSystemLog('Sentient Core', 'Core power-up sequence executed.');
    app.showToast('APEX Sentient Core — ONLINE');
  });

  byId<HTMLButtonElement>('btn-terminal')?.addEventListener('click', (): void => {
    app.audio.playClick(880);
    app.openTerminalInspector();
  });

  byId<HTMLButtonElement>('btn-alerts')?.addEventListener('click', (): void => {
    app.audio.playClick(880);
    app.openResourceInspector('telemetry');
  });

  byId<HTMLButtonElement>('btn-voice')?.addEventListener('click', (): void => {
    if (app.state.coreStatus === 'HALTED') return;
    const next: CoreStatus = app.state.coreStatus === 'LISTENING' ? 'THINKING' : 'LISTENING';
    app.audio.playVoice(next === 'LISTENING');
    app.setCoreStatus(next);
    app.addSystemLog(
      'Voice Engine',
      next === 'LISTENING' ? 'Microphone active (Whisper Flow)' : 'Voice input closed',
    );
    app.showToast(next === 'LISTENING' ? 'Listening... (Ctrl+Space to stop)' : 'Voice dictation stopped');
  });

  byId<HTMLButtonElement>('btn-focus')?.addEventListener('click', (): void => {
    app.audio.playClick(940);
    app.state.focusMode = !app.state.focusMode;
    app.setCoreStatus(app.state.coreStatus);
    app.showToast(app.state.focusMode ? 'Sentient Focus Mode enabled' : 'Constellation Mode restored');
  });

  byId<HTMLButtonElement>('btn-settings')?.addEventListener('click', (): void => {
    app.audio.playClick(880);
    app.openSettingsInspector();
  });

  byId<HTMLButtonElement>('btn-inspector')?.addEventListener('click', (): void => {
    app.audio.playClick(820);
    const drawer = byId<HTMLElement>('inspector-drawer');
    if (drawer?.classList.contains('is-open')) app.closeInspector();
    else openChatThread(app);
  });

  byId<HTMLButtonElement>('btn-close-inspector')?.addEventListener('click', (): void => {
    app.audio.playClick(640);
    app.closeInspector();
  });

  byId<HTMLButtonElement>('btn-kill')?.addEventListener('click', (): void => {
    if (app.state.coreStatus === 'HALTED') {
      app.audio.playBoot();
      app.setCoreStatus(app.state.previousStatus === 'HALTED' ? 'THINKING' : app.state.previousStatus);
      core.assemble();
      app.triggerBurst(2200);
      app.addSystemLog('Orchestrator', 'Emergency halt cleared — systems resumed.');
      app.showToast('All systems resumed');
    } else {
      app.audio.playKill();
      app.setCoreStatus('HALTED');
      core.disperse();
      app.addSystemLog('SAFETY', 'EMERGENCY KILL SWITCH ACTIVATED — All agents halted.');
      app.showToast('EMERGENCY HALT: All agents stopped');
    }
  });

  const form = byId<HTMLFormElement>('command-form');
  form?.addEventListener('submit', (event: SubmitEvent): void => {
    event.preventDefault();
    const input = byId<HTMLInputElement>('command-input');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    input.value = '';

    const lower = raw.toLowerCase();
    if (lower === '/kill') {
      app.audio.playKill();
      app.setCoreStatus('HALTED');
      core.disperse();
      app.showToast('EMERGENCY HALT executed');
      return;
    }
    if (lower === '/resume') {
      app.audio.playBoot();
      app.setCoreStatus('THINKING');
      core.assemble();
      app.showToast('Core resumed');
      return;
    }
    if (lower.startsWith('/memory')) {
      app.audio.playDispatch();
      const context = app.resources.find((resource) => resource.id === 'context');
      if (context) context.pct = 15;
      app.addSystemLog('SQLite Memory', `Executed command: ${raw}`);
      app.triggerBurst(1800);
      app.renderWings();
      app.showToast('Memory operation executed');
      return;
    }

    if (app.state.coreStatus === 'HALTED') {
      app.audio.playBoot();
      app.setCoreStatus('THINKING');
    } else {
      app.audio.playDispatch();
    }

    const mention = raw.match(/^@(\w+)/i);
    if (mention) {
      const target = (mention[1] ?? '').toLowerCase();
      const agent = app.agents.find(
        (item) => item.id.toLowerCase().includes(target) || item.name.toLowerCase().includes(target),
      );
      if (agent) {
        agent.active = true;
        agent.task = raw;
        agent.logs.unshift(`Dispatched: ${raw}`);
        app.addSystemLog(agent.name, `Executing: ${raw}`);
        app.triggerBurst(2200);
        app.renderWings();
        app.openAgentInspector(agent.id);
        app.showToast(`Dispatched to ${agent.name}`);
        return;
      }
    }

    app.addSystemLog('Orchestrator', `Command dispatched: ${raw}`);
    app.triggerBurst(2000);
    app.showToast(`Dispatched: ${raw}`);
  });

  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      byId<HTMLButtonElement>('btn-voice')?.click();
    } else if (event.key === 'Escape') {
      app.closeInspector();
    }
  });
}
