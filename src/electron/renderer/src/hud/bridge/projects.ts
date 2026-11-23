// Project and session bridge for APEX HUD renderer.
// All project/session text is escaped with esc() and uses dir="auto" for Arabic.

import { byId, esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { WorkspaceContext } from '../../window';

function scopeLabel(ctx: WorkspaceContext): string {
  const scope = ctx.scope;
  if (!scope || scope.kind === 'daily') return 'DAILY MODE';
  return scope.projectId !== null ? `PROJECT ${scope.projectId}` : 'CLI MODE';
}

/** Fetches workspace context and renders the project chip + session strip. */
export async function updateWorkspaceContext(app: ApexHudApi): Promise<void> {
  try {
    const ctx = await window.api.getWorkspaceContext();
    const label = byId('project-label');
    if (label) {
      label.textContent = scopeLabel(ctx);
      label.setAttribute('dir', 'auto');
      label.classList.toggle('is-daily', ctx.scope?.kind === 'daily');
    }
    renderProjects(ctx);
    renderSessions(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    app.showToast(`Project context error: ${msg.slice(0, 80)}`);
  }
}

/** Renders the Daily option and saved projects in the popover. */
function renderProjects(ctx: WorkspaceContext): void {
  const host = byId('project-list');
  if (!host) return;
  const isDaily = ctx.scope?.kind === 'daily';
  const parts: string[] = [];

  parts.push(
    `<button type="button" class="popover-option ${isDaily ? 'is-active' : ''}" data-daily="1">` +
      `<span class="option-icon">◈</span><span class="option-label" dir="auto">Daily / Core</span></button>`,
  );

  for (const project of ctx.projects ?? []) {
    const active = !isDaily && ctx.scope?.projectId === project.id;
    parts.push(
      `<button type="button" class="popover-option ${active ? 'is-active' : ''}" data-project="${project.id}">` +
        `<span class="option-icon">▣</span><span class="option-label" dir="auto">${esc(project.name)}</span></button>`,
    );
  }

  parts.push(
    `<button type="button" class="popover-option option-add" data-action="pick-folder">` +
      `<span class="option-icon">＋</span><span class="option-label">Open folder…</span></button>`,
  );
  host.innerHTML = parts.join('');
}

/** Renders the thin session strip above the command dock. */
function renderSessions(ctx: WorkspaceContext): void {
  const host = byId('session-items');
  if (!host) return;
  const activeId = ctx.activeSessionId ?? ctx.scope?.sessionId ?? null;
  const parts: string[] = [];

  for (const session of ctx.sessions ?? []) {
    const active = session.id === activeId;
    parts.push(
      `<button type="button" class="session-item ${active ? 'is-active' : ''}" data-session="${session.id}">` +
        `<span dir="auto">${esc(session.title)}</span></button>`,
    );
  }

  parts.push(
    `<button type="button" class="session-item session-add" data-action="create-session">＋</button>`,
    `<button type="button" class="session-item session-log" data-action="show-log">SESSIONS</button>`,
  );
  host.innerHTML = parts.join('');
}

async function refresh(app: ApexHudApi): Promise<void> {
  await updateWorkspaceContext(app);
}

/** Handles a workspace action result and refreshes the UI. */
async function applyAction(app: ApexHudApi, result: { ok: boolean; error?: string }): Promise<void> {
  if (!result.ok) {
    app.showToast(result.error ?? 'Workspace action failed');
    return;
  }
  await refresh(app);
}

/** Shows the last 100 messages of the active session in the Inspector. */
async function showSessionLog(app: ApexHudApi): Promise<void> {
  const result = await window.api.sessionMessages();
  const messages = result.messages ?? [];
  const body = messages.length === 0
    ? '<p class="ins-muted">No messages in this session yet.</p>'
    : messages.map((m) =>
        `<div class="ins-trace"><span class="ins-tag">${esc(m.role)}</span>` +
        `<pre class="ins-pre" dir="auto">${esc(m.content)}</pre></div>`,
      ).join('');
  app.openInspector('Session History', 'LAST 100 MESSAGES', '#F59E0B', body);
}

/** Initializes popover interactions and keyboard shortcuts. */
export function initProjectBridge(app: ApexHudApi): void {
  const btnProject = byId<HTMLButtonElement>('btn-project');
  const popover = byId('project-popover');
  const closeBtn = byId('btn-close-popover');
  const popoverFoot = byId('btn-new-session');

  btnProject?.addEventListener('click', (): void => {
    if (!popover) return;
    void refresh(app).then((): void => {
      if (popover) popover.hidden = !popover.hidden;
    });
  });

  closeBtn?.addEventListener('click', (): void => {
    if (popover) popover.hidden = true;
  });

  popover?.addEventListener('click', (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const option = target.closest<HTMLElement>('.popover-option');
    if (!option) return;
    void (async (): Promise<void> => {
      if (option.dataset['daily'] !== undefined) {
        await applyAction(app, await window.api.switchProject(null, null));
      } else if (option.dataset['project'] !== undefined) {
        const id = Number(option.dataset['project']);
        if (!Number.isNaN(id)) await applyAction(app, await window.api.switchProject(id, null));
      } else if (option.dataset['action'] === 'pick-folder') {
        await applyAction(app, await window.api.pickFolder());
      }
      if (popover) popover.hidden = true;
    })();
  });

  popoverFoot?.addEventListener('click', (): void => {
    void (async (): Promise<void> => {
      await applyAction(app, await window.api.createSession());
    })();
  });

  byId('session-items')?.addEventListener('click', (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest<HTMLElement>('.session-item');
    if (!item) return;
    void (async (): Promise<void> => {
      if (item.dataset['session'] !== undefined) {
        const id = Number(item.dataset['session']);
        if (!Number.isNaN(id)) await applyAction(app, await window.api.selectSession(id));
      } else if (item.dataset['action'] === 'create-session') {
        await applyAction(app, await window.api.createSession());
      } else if (item.dataset['action'] === 'show-log') {
        await showSessionLog(app);
      }
    })();
  });

  // Shortcuts: Ctrl+Shift+P (projects), N (new session), O (open folder).
  // Ctrl+Space and Escape are intentionally untouched.
  window.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'p' && key !== 'n' && key !== 'o') return;
    event.preventDefault();
    void (async (): Promise<void> => {
      if (key === 'p') {
        if (popover) popover.hidden = !popover.hidden;
      } else if (key === 'n') {
        await applyAction(app, await window.api.createSession());
      } else if (key === 'o') {
        await applyAction(app, await window.api.pickFolder());
      }
    })();
  });

  void refresh(app);
}

export type { WorkspaceContext };
