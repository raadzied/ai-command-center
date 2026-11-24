import { esc } from '../dom';
import { agentLabel } from './agent-meta';
import type { ApexHudApi, NodeStatus } from '../types';

const PULSE_MS = 1400;
const LOG_LIMIT = 8;
const PULSE_TEXT = 'Consultation pulse';

// يضيء عقدتين مؤقتاً عند كل تشاور، وينظّف المؤقتات عند التكرار أو الإغلاق.
export function bindConsultPulse(app: ApexHudApi, api: Window['api']): () => void {
  const timers = new Map<string, number>();
  const savedLogs = new Map<string, string[]>();
  const savedActive = new Map<string, boolean>();
  const savedStatus = new Map<string, NodeStatus>();

  function restore(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(id);
    const logs = savedLogs.get(id);
    const wasActive = savedActive.get(id);
    const wasStatus = savedStatus.get(id);
    if (logs === undefined && wasActive === undefined && wasStatus === undefined) return;
    const node = app.agents.find((item): boolean => item.id === id);
    if (node) {
      if (logs) node.logs = logs;
      if (wasActive !== undefined) node.active = wasActive;
      if (wasStatus !== undefined) node.status = wasStatus;
    }
    savedLogs.delete(id);
    savedActive.delete(id);
    savedStatus.delete(id);
  }

  function pulse(id: string): void {
    restore(id);
    const node = app.agents.find((item): boolean => item.id === id);
    if (!node) return;
    savedLogs.set(id, node.logs.slice(0, LOG_LIMIT));
    savedActive.set(id, node.active);
    savedStatus.set(id, node.status);
    node.active = true;
    node.status = 'active';
    node.logs.unshift(PULSE_TEXT);
    app.renderWings();
    app.triggerBurst(1400);
    timers.set(id, window.setTimeout((): void => {
      restore(id);
      app.renderWings();
    }, PULSE_MS));
  }

  const unsubscribe = api.onAgentConsult((data): void => {
    const from = esc(agentLabel(data.from));
    const to = esc(agentLabel(data.to));
    const topic = esc(data.topic.slice(0, 120));
    app.addSystemLog('Consult', `Consult ${from} -> ${to}: ${topic}`);
    pulse(data.from);
    pulse(data.to);
  });

  const cleanup = (): void => {
    unsubscribe();
    for (const id of Array.from(timers.keys())) restore(id);
  };

  window.addEventListener('beforeunload', cleanup, { once: true });
  return cleanup;
}
