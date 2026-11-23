import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { logger as log } from '../llm/logger.js';
import { getProjectBrief, refreshProjectBrief } from '../core/project-brief.js';
import type { ProjectBrief } from '../core/project-brief.js';
import { getWindowEntry } from './window-registry.js';

export type BriefResult =
  | { ok: true; brief: ProjectBrief }
  | { ok: false; mode: 'daily' }
  | { ok: false; error: string };

function workspaceRoot(event: IpcMainInvokeEvent): string | null {
  const entry = getWindowEntry(event.sender.id);
  if (!entry || entry.scope.kind === 'daily') return null;
  return entry.scope.workspaceRoot.trim() === '' ? null : entry.scope.workspaceRoot;
}

async function loadBrief(
  event: IpcMainInvokeEvent,
  refresh: boolean,
): Promise<BriefResult> {
  const entry = getWindowEntry(event.sender.id);
  if (!entry) return { ok: false, error: 'Window not registered' };
  if (entry.scope.kind === 'daily') return { ok: false, mode: 'daily' };
  const root = workspaceRoot(event);
  if (!root) return { ok: false, error: 'Project folder is unavailable' };
  try {
    const brief = refresh
      ? await refreshProjectBrief(root)
      : await getProjectBrief(root);
    return { ok: true, brief };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Project brief IPC failed', { message, refresh });
    return { ok: false, error: message };
  }
}

export function registerBriefHandlers(): void {
  ipcMain.handle('workspace:brief:get', async (event): Promise<BriefResult> =>
    loadBrief(event, false));
  ipcMain.handle('workspace:brief:refresh', async (event): Promise<BriefResult> =>
    loadBrief(event, true));
}
