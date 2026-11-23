// Project bridge for APEX HUD renderer (chip + project popover).
// Session strip rendering/interactions live in ./sessions.ts.
// All project text is escaped with esc() and uses dir="auto" for Arabic.

import { byId, esc } from '../dom';
import type { ApexHudApi } from '../types';
import type { WorkspaceContext } from '../../window';
import { renderSessions, initSessionStrip } from './sessions';
import { refreshHudSnapshot } from './snapshot';

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

  const folderSvg =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const dailySvg =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
  const plusSvg =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`;
  const externalSvg =
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>`;

  parts.push(
    `<button type="button" class="popover-option ${isDaily ? 'is-active' : ''}" data-daily="1">` +
      `<span class="option-icon">${dailySvg}</span><span class="option-label" dir="auto">Daily / Core</span></button>`,
  );

  for (const project of ctx.projects ?? []) {
    const active = !isDaily && ctx.scope?.projectId === project.id;
    parts.push(
      `<div class="project-row" style="display: flex; align-items: center; gap: 4px">` +
        `<button type="button" class="popover-option project-main-btn ${active ? 'is-active' : ''}" data-project="${project.id}" style="flex: 1; min-width: 0">` +
          `<span class="option-icon">${folderSvg}</span><span class="option-label" dir="auto">${esc(project.name)}</span>` +
        `</button>` +
        `<button type="button" class="option-icon option-open project-open-win-btn" data-open-project="${project.id}" title="Open in new window" aria-label="Open in new window" style="background: none; border: 1px solid transparent; border-radius: 4px; color: inherit; padding: 2px">` +
          `${externalSvg}` +
        `</button></div>`,
    );
  }

  parts.push(
    `<button type="button" class="popover-option option-add" data-action="pick-folder">` +
      `<span class="option-icon">${plusSvg}</span><span class="option-label">Open folder…</span></button>`,
  );
  host.innerHTML = parts.join('');
}

async function refresh(app: ApexHudApi): Promise<void> {
  await updateWorkspaceContext(app);
  await refreshHudSnapshot(app);
}

/** Opens (or focuses) a project in its own window, then closes the popover. */
async function openInWindow(app: ApexHudApi, projectId: number, popover: HTMLElement | null): Promise<void> {
  const res = await window.api.openProjectWindow(projectId);
  if (popover) popover.hidden = true;
  if (!res.ok) {
    const message = 'error' in res && typeof res.error === 'string' && res.error.trim() !== ''
      ? res.error : 'Failed to open project window';
    app.showToast(message);
    return;
  }
  app.showToast(res.focusedExisting === true ? 'Focused existing window' : 'Opened in new window');
}

/** Handles a workspace action result and refreshes the UI. */
async function applyAction(app: ApexHudApi, result: { ok: boolean; error?: string }): Promise<void> {
  if (!result.ok) {
    app.showToast(result.error ?? 'Workspace action failed');
    return;
  }
  await refresh(app);
}

/** Initializes project popover interactions and keyboard shortcuts. */
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
    if (!(target instanceof Element)) return;
    const openBtn = target.closest<HTMLElement>('.project-open-win-btn');
    if (openBtn) {
      event.stopPropagation();
      event.preventDefault();
      const id = Number(openBtn.dataset['openProject']);
      if (!Number.isNaN(id)) void openInWindow(app, id, popover);
      return;
    }
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

  // Session strip: toggle, collapse, outside-click, row actions.
  initSessionStrip(app, (): Promise<void> => refresh(app));

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
