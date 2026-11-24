import { byId, esc } from '../dom';
import type { ApexHudApi, RunPhase } from '../types';
import { agentLabel } from './agent-meta';

export interface ResponseMeta {
  agentUsed?: string | null;
  intent?: string;
  elapsedMs?: number;
}

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

export function showResponse(app: ApexHudApi, content: string, meta: ResponseMeta): void {
  const tags = [
    `<span class="ins-tag is-cyan">${esc(agentLabel(meta.agentUsed ?? null))}</span>`,
    `<span class="ins-tag is-amber">intent: ${esc(meta.intent ?? 'n/a')}</span>`,
    `<span class="ins-tag">${esc(meta.elapsedMs ?? 0)}ms</span>`,
  ].join('');
  const body = `<div class="ins-trace"><div class="ins-row" style="justify-content: flex-start; flex-wrap: wrap">${tags}</div><pre class="ins-pre">${esc(content)}</pre></div>`;
  app.openInspector('Core Response', 'LIVE AGENT OUTPUT', '#22D3EE', body);
}
