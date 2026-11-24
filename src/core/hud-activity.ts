import { logger as log } from '../llm/logger.js';

export type NodeActivityState = 'idle' | 'active' | 'done' | 'error';

export interface HudActivityEvent {
  nodeId: string;
  state: NodeActivityState;
  detail?: string;
  ttlMs?: number;
}

export type ActivityEmitter = (event: HudActivityEvent) => void;

const DETAIL_LIMIT = 120;

// البث اختياري: الغياب (CLI/الاختبارات)=no-op، والفشل يُسجَّل ولا يوقف التشغيل.
export function emitActivity(
  emitter: ActivityEmitter | undefined,
  event: HudActivityEvent,
): void {
  if (!emitter) return;
  const detail = event.detail === undefined ? undefined : event.detail.slice(0, DETAIL_LIMIT);
  const payload: HudActivityEvent = detail === undefined ? event : { ...event, detail };
  try {
    emitter(payload);
  } catch (err) {
    log.warn('HUD activity emitter failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
