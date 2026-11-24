import { byId, esc } from '../dom';
import type { ApexHudApi } from '../types';
import { renderSafeMarkdown } from './markdown';

export interface ThreadMessageInput {
  role: string;
  content: string;
  agentName?: string | null;
}

interface ThreadMessage {
  role: 'user' | 'agent';
  content: string;
  agentName?: string;
  at: number;
}

let messages: ThreadMessage[] = [];
const MAX_MESSAGES = 200;

function isOpen(): boolean {
  return byId('inspector-drawer')?.classList.contains('is-open') === true;
}

function bubble(message: ThreadMessage): string {
  const isUser = message.role === 'user';
  const author = isUser ? 'أنت' : esc(message.agentName ?? 'المساعد');
  const time = esc(new Date(message.at).toLocaleTimeString('en-GB'));
  const role = isUser ? 'chat-user' : 'chat-agent';
  return (
    `<div class="chat-bubble ${role}">` +
      `<div class="chat-meta" dir="auto"><span class="chat-author">${author}</span>` +
      `<span class="chat-time">${time}</span></div>` +
      `<div class="chat-body">${renderSafeMarkdown(message.content)}</div>` +
    `</div>`
  );
}

export function renderChatThread(): void {
  const host = byId('inspector-body');
  if (!host) return;
  host.innerHTML = `<div class="chat-thread" dir="rtl">${messages.map(bubble).join('')}</div>`;
  if (isOpen()) {
    const thread = host.querySelector<HTMLElement>('.chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
  }
}

export function loadThreadMessages(input: readonly ThreadMessageInput[]): void {
  messages = input.slice(-MAX_MESSAGES).map((item): ThreadMessage => ({
    role: item.role === 'user' ? 'user' : 'agent',
    content: item.content,
    ...(item.agentName ? { agentName: item.agentName } : {}),
    at: Date.now(),
  }));
  renderChatThread();
}

export function appendChatMessage(
  role: 'user' | 'agent',
  content: string,
  agentName?: string | null,
): void {
  messages.push({
    role,
    content,
    ...(agentName ? { agentName } : {}),
    at: Date.now(),
  });
  if (messages.length > MAX_MESSAGES) messages.shift();
  renderChatThread();
  if (!isOpen()) byId('btn-inspector')?.classList.add('has-unread');
}

export function openChatThread(
  app: ApexHudApi,
  input?: readonly ThreadMessageInput[],
): void {
  if (input) loadThreadMessages(input);
  app.openInspector('Chat Thread', 'SESSION CONVERSATION', '#22D3EE', '<div class="chat-thread"></div>');
  renderChatThread();
  byId('btn-inspector')?.classList.remove('has-unread');
}

export async function loadActiveSessionThread(): Promise<void> {
  try {
    const result = await window.api.sessionMessages();
    loadThreadMessages(result.messages ?? []);
  } catch (err) {
    console.warn('[chat-thread] session messages unavailable', err);
  }
}
