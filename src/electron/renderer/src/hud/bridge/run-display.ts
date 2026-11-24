import { byId } from '../dom';
import type { ApexHudApi, RunPhase } from '../types';

let lastRunPhase: RunPhase | null = null;

export function getLastRunPhase(): RunPhase | null {
  return lastRunPhase;
}

export function resetLastRunPhase(): void {
  lastRunPhase = null;
}

export function isRunPhase(value: string): value is RunPhase {
  return ['IDLE', 'PLANNING', 'THINKING', 'AWAITING_APPROVAL', 'APPLYING_CHANGES',
    'VALIDATING', 'DONE', 'CANCELLED', 'ERROR'].includes(value);
}

export function showRunPhase(app: ApexHudApi, phase: RunPhase, detail?: string): void {
  lastRunPhase = phase;
  const status = phase === 'CANCELLED' ? 'HALTED' : phase === 'IDLE' || phase === 'DONE' || phase === 'ERROR' ? 'IDLE' : 'THINKING';
  app.setCoreStatus(status);
  const label = byId<HTMLElement>('status-label');
  if (label) label.textContent = `STATUS: ${phase}`;
  app.addSystemLog('Orchestrator', detail ? `${phase}: ${detail}` : `Run phase: ${phase}`);
}
