import { esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { HudActivityEvent } from '../../hud-api';

const NODE_ALIASES: Record<string, string> = { fs: 'filesystem' };

function resolveNodeId(id: string): string {
  return NODE_ALIASES[id] ?? id;
}

// يربط بث النشاط الحقيقي بالعقد، ويعيدها إلى السكون بعد انتهاء المهلة.
export function bindHudActivity(app: ApexHudApi, api: Window['api']): () => void {
  const timers = new Map<string, number>();

  function clearTimer(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.delete(id);
  }

  function render(): void {
    app.renderWings();
    app.drawPaths();
  }

  function toIdle(id: string): void {
    const node = app.agents.find((item) => item.id === id)
      ?? app.resources.find((item) => item.id === id);
    if (!node) return;
    node.status = 'idle';
    if ('active' in node) node.active = false;
    render();
  }

  const unsubscribe = api.onHudActivity(({ nodeId, state, detail, ttlMs }: HudActivityEvent): void => {
    const id = resolveNodeId(nodeId);
    const node = app.agents.find((item) => item.id === id)
      ?? app.resources.find((item) => item.id === id);
    if (!node) return;

    clearTimer(id);
    node.status = state;
    if ('active' in node) node.active = state === 'active';
    node.lastActivity = { at: Date.now(), detail: detail ?? '' };
    const label = 'name' in node ? node.name : id;
    app.addSystemLog(label, `${state}: ${esc(detail ?? '')}`);
    if ('logs' in node) node.logs.unshift(`${state}: ${detail ?? ''}`);
    render();

    if (ttlMs !== undefined && (state === 'done' || state === 'error')) {
      timers.set(id, window.setTimeout((): void => {
        timers.delete(id);
        toIdle(id);
      }, ttlMs));
    }
  });

  const cleanup = (): void => {
    unsubscribe();
    for (const id of Array.from(timers.keys())) clearTimer(id);
  };
  window.addEventListener('beforeunload', cleanup, { once: true });
  return cleanup;
}
