// Session strip: rendering, inline rename and two-click delete.
// SVG geometric icons only — no emoji, no window.prompt/confirm/alert.
// Session titles are escaped with esc() before interpolation (XSS-safe).
import { byId, esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { WorkspaceContext } from '../../window';
import { loadActiveSessionThread, openChatThread } from './chat-thread';

type Refresh = () => Promise<void>;
type FinishMode = 'enter' | 'blur' | 'cancel';

const svg = (paths: string): string => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICON_PEN = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>');
const ICON_TRASH = svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>');
const ICON_CHECK = svg('<path d="M20 6 9 17l-5-5"/>');
const ICON_PLUS = svg('<path d="M12 5v14"/><path d="M5 12h14"/>');

/** Renders each session row (title + rename/delete actions) plus add/log buttons. */
export function renderSessions(ctx: WorkspaceContext): void {
  const host = byId('session-items');
  if (!host) return;
  const activeId = ctx.activeSessionId ?? ctx.scope?.sessionId ?? null;
  const parts: string[] = [];

  for (const session of ctx.sessions ?? []) {
    const active = session.id === activeId;
    parts.push(
      `<div class="session-row">` +
        `<button type="button" class="session-item ${active ? 'is-active' : ''}" data-session="${session.id}">` +
          `<span class="session-title" dir="auto">${esc(session.title)}</span></button>` +
        `<span class="session-actions">` +
          `<button type="button" class="session-act session-rename-btn" data-rename="${session.id}" title="Rename session" aria-label="Rename session">${ICON_PEN}</button>` +
          `<button type="button" class="session-act session-del-btn" data-del="${session.id}" title="Delete session" aria-label="Delete session">${ICON_TRASH}</button>` +
        `</span></div>`,
    );
  }

  parts.push(
    `<button type="button" class="session-item session-add" data-action="create-session" title="New session" aria-label="New session">${ICON_PLUS}</button>` +
    `<button type="button" class="session-item session-log" data-action="show-log">SESSIONS</button>`,
  );
  host.innerHTML = parts.join('');
  const countEl = byId('session-count');
  if (countEl) countEl.textContent = String((ctx.sessions ?? []).length);
}

/** Manually opens the unified thread with the active session messages. */
async function showSessionLog(app: ApexHudApi): Promise<void> {
  const result = await window.api.sessionMessages();
  openChatThread(app, result.messages ?? []);
}

/** Swaps the row button for a focused, fully-selected input (inline rename). */
function startRename(id: number, row: HTMLElement, app: ApexHudApi, refresh: Refresh): void {
  const btn = row.querySelector<HTMLElement>('.session-item');
  const titleEl = row.querySelector<HTMLElement>('.session-title');
  if (!btn || !titleEl) return;
  const original = titleEl.textContent ?? '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-rename-input';
  input.dir = 'auto';
  input.value = original;
  btn.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = async (mode: FinishMode): Promise<void> => {
    if (done) return;
    done = true;
    const next = input.value;
    const shouldSave = mode === 'enter' || (mode === 'blur' && next !== original);
    if (shouldSave) {
      const res = await window.api.renameSession(id, next);
      if (!res.ok) app.showToast(res.error ?? 'Rename failed');
    }
    await refresh();
  };
  input.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (event.key === 'Enter') { event.preventDefault(); void finish('enter'); }
    else if (event.key === 'Escape') { event.preventDefault(); void finish('cancel'); }
  });
  input.addEventListener('blur', (): void => { void finish('blur'); });
}

let confirmTimer = 0;
let confirmingId = -1;
function armConfirm(btn: HTMLElement, id: number): void {
  if (confirmTimer !== 0) { window.clearTimeout(confirmTimer); confirmTimer = 0; }
  confirmingId = id;
  btn.classList.add('is-confirming');
  btn.innerHTML = ICON_CHECK;
  btn.title = 'Click again to delete';
  confirmTimer = window.setTimeout((): void => {
    btn.classList.remove('is-confirming');
    btn.innerHTML = ICON_TRASH;
    btn.title = 'Delete session';
    confirmingId = -1;
    confirmTimer = 0;
  }, 3000);
}

/** Second click within 3s: deletes, toasts and refreshes list + counter. */
async function runDelete(id: number, app: ApexHudApi, refresh: Refresh): Promise<void> {
  const res = await window.api.deleteSession(id);
  if (!res.ok) {
    app.showToast(res.error ?? 'Delete failed');
    await refresh();
    return;
  }
  app.showToast('Session deleted');
  await refresh();
}

/** Wires strip toggle/collapse/outside-click plus select/create/log/rename/delete. */
export function initSessionStrip(app: ApexHudApi, refresh: Refresh): void {
  const strip = byId('session-strip');
  const toggleBtn = byId<HTMLButtonElement>('session-toggle');
  const setStripOpen = (open: boolean): void => {
    strip?.classList.toggle('is-open', open);
    toggleBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  toggleBtn?.addEventListener('click', (): void => {
    setStripOpen(!strip?.classList.contains('is-open'));
  });
  byId('session-collapse')?.addEventListener('click', (): void => setStripOpen(false));
  document.addEventListener('click', (event: MouseEvent): void => {
    const target = event.target;
    if (target instanceof Node && strip && !strip.contains(target)) setStripOpen(false);
  });

  byId('session-items')?.addEventListener('click', (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const renameBtn = target.closest<HTMLElement>('[data-rename]');
    if (renameBtn) {
      const id = Number(renameBtn.dataset['rename']);
      const row = renameBtn.closest<HTMLElement>('.session-row');
      if (!Number.isNaN(id) && row) startRename(id, row, app, refresh);
      return;
    }
    const delBtn = target.closest<HTMLElement>('[data-del]');
    if (delBtn) {
      const id = Number(delBtn.dataset['del']);
      if (Number.isNaN(id)) return;
      if (confirmingId === id) {
        if (confirmTimer !== 0) { window.clearTimeout(confirmTimer); confirmTimer = 0; }
        confirmingId = -1;
        void runDelete(id, app, refresh);
      } else {
        armConfirm(delBtn, id);
      }
      return;
    }
    const item = target.closest<HTMLElement>('.session-item');
    if (!item) return;
    void (async (): Promise<void> => {
      if (item.dataset['session'] !== undefined) {
        const id = Number(item.dataset['session']);
        if (Number.isNaN(id)) return;
        const res = await window.api.selectSession(id);
        if (!res.ok) { app.showToast(res.error ?? 'Select failed'); return; }
        await loadActiveSessionThread();
        await refresh();
      } else if (item.dataset['action'] === 'create-session') {
        const res = await window.api.createSession();
        if (!res.ok) { app.showToast(res.error ?? 'Create failed'); return; }
        await refresh();
      } else if (item.dataset['action'] === 'show-log') {
        await showSessionLog(app);
      }
    })();
  });
}
