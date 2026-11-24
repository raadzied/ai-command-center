import { listRegisteredAgents } from '../agents/registry.js';
import { throwIfAborted } from './run-control.js';
import { logger as log } from '../llm/logger.js';
import type { TaskAgent } from './task-runner.js';
import type { SharedBoard } from './shared-board.js';
import type { AgentName, Context, Task } from '../types.js';

const MAX_CONSULTS = 2;
const TOPIC_LIMIT = 160;
const ASK_PATTERN = /\[\[ASK_PEER:([^\]|\n]+?)\s*\|\s*([^\]\n]+?)\]\]/g;

export interface ConsultRequest {
  readonly from: AgentName;
  readonly to: AgentName;
  readonly question: string;
}

export interface ConsultEvent {
  readonly from: AgentName;
  readonly to: AgentName;
  readonly topic: string;
}

export interface ResolveConsultOptions {
  readonly context: Context;
  readonly task: Task;
  readonly resolvePeer: (name: AgentName) => TaskAgent | null;
  readonly signal?: AbortSignal;
  readonly board?: SharedBoard;
  readonly onConsult?: (event: ConsultEvent) => void;
}

export interface ConsultationResult {
  readonly content: string;
  readonly consultations: number;
}

function isRegistered(name: string): boolean {
  return listRegisteredAgents().some((agent): boolean => agent === name);
}

// يستخرج حتى استشارتين صالحتين من وسوم الأقران في نص واحد.
export function parseAskPeerMarkers(
  text: string,
  fromAgent: AgentName,
  chain: readonly AgentName[] = [],
): ConsultRequest[] {
  const requests: ConsultRequest[] = [];
  const visited: AgentName[] = [fromAgent, ...chain];
  for (const match of text.matchAll(ASK_PATTERN)) {
    if (requests.length >= MAX_CONSULTS) break;
    const target = (match[1] ?? '').trim();
    const question = stripExecutionMarkers((match[2] ?? '').trim());
    if (!isRegistered(target) || question.length === 0) continue;
    const to = target as AgentName;
    if (to === fromAgent || visited.includes(to)) continue;
    visited.push(to);
    requests.push({ from: fromAgent, to, question });
  }
  return requests;
}

// يجرّد وسوم الأقران من النص الأساسي — وسوم الملفات تبقى سليمة.
export function stripAskPeerMarkers(text: string): string {
  return text.replace(ASK_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
}

// يجرّد كل وسوم التنفيذ من رد الوكيل المستشار.
export function stripExecutionMarkers(text: string): string {
  return text
    .replace(ASK_PATTERN, '')
    .replace(/\[ASK_PEER:[^\]]*\]/g, '')
    .replace(/\[{1,2}WRITE_FILE:[^\]]*\]{1,2}[\s\S]*?\[{1,2}\/WRITE_FILE\]{1,2}/g, '')
    .replace(/\[{1,2}WRITE_FILE:[^\]]*\]{1,2}/g, '')
    .replace(/\[{1,2}MKDIR:[^\]]*\]{1,2}/g, '')
    .replace(/\[{1,2}MCP_CALL:[^\]]*\]{1,2}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildPeerTask(base: Task, request: ConsultRequest): Task {
  return {
    ...base,
    id: `consult-${request.to}-${Date.now()}`,
    description: `استشارة من ${request.from}: ${request.question}`,
    intent: 'advise',
    agentName: request.to,
    verificationRequired: false,
    dependsOn: [],
  };
}

// عمق ثابت 1: المستشار يُستدعى مباشرة ولا تُعالج وسومه بالتسلسل.
export async function resolveConsultations(
  fromAgent: AgentName,
  rawText: string,
  opts: ResolveConsultOptions,
): Promise<ConsultationResult> {
  throwIfAborted(opts.signal);
  const requests = parseAskPeerMarkers(rawText, fromAgent);
  const base = stripAskPeerMarkers(rawText);
  if (requests.length === 0) return { content: base, consultations: 0 };

  const replies: string[] = [];
  for (const request of requests) {
    throwIfAborted(opts.signal);
    const peer = opts.resolvePeer(request.to);
    if (!peer) {
      log.warn('Peer agent unavailable', { to: request.to });
      continue;
    }
    const response = await peer.execute(
      buildPeerTask(opts.task, request), opts.context,
      opts.signal ? { signal: opts.signal } : {},
    );
    throwIfAborted(opts.signal);
    const clean = stripExecutionMarkers(response.content);
    if (clean.length === 0) continue;
    replies.push(`# استشارة ${request.to}:\n${clean}`);
    opts.board?.post('agent-bus', `consult:${request.to}`, clean);
    opts.onConsult?.({
      from: request.from,
      to: request.to,
      topic: request.question.slice(0, TOPIC_LIMIT),
    });
  }
  return {
    content: [base, ...replies].filter((part): boolean => part.length > 0).join('\n\n').trim(),
    consultations: replies.length,
  };
}
