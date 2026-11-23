// Skills IPC: list/toggle/import, all resolved from the sender window scope.

import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import { importSkillFile, syncSkillsCatalog } from '../core/skills-manager.js';
import { listSkillsForProject, setProjectSkillEnabled } from '../memory/skills-catalog.js';
import type { ProjectSkillView } from '../memory/skills-catalog.js';
import { getWindowEntry } from './window-registry.js';
import type { WindowEntry } from './window-registry.js';

interface SkillsResult {
  ok: boolean;
  error?: string;
  skills: ProjectSkillView[];
}

function contextOf(event: IpcMainInvokeEvent): { win: BrowserWindow; entry: WindowEntry } | null {
  const entry = getWindowEntry(event.sender.id);
  const win = BrowserWindow.fromWebContents(event.sender);
  return entry && win && !win.isDestroyed() ? { win, entry } : null;
}

function fail(message: string): SkillsResult {
  return { ok: false, error: message, skills: [] };
}

function skillsFor(entry: WindowEntry): ProjectSkillView[] {
  const projectId = entry.scope.kind === 'workspace' ? entry.scope.projectId : null;
  return listSkillsForProject(getDb(), projectId);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Registers the three skills IPC handlers. */
export function registerSkillsHandlers(): void {
  ipcMain.handle('skills:list', async (event): Promise<SkillsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    try {
      syncSkillsCatalog(getDb(), ctx.entry.scope);
      return { ok: true, skills: skillsFor(ctx.entry) };
    } catch (err) {
      log.warn('skills:list failed', { message: errorMessage(err) });
      return fail(errorMessage(err));
    }
  });

  ipcMain.handle('skills:toggle', async (event, skillId: number, enabled: boolean): Promise<SkillsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (!Number.isInteger(skillId) || skillId < 1 || typeof enabled !== 'boolean') {
      return fail('Invalid toggle request');
    }
    const projectId = ctx.entry.scope.kind === 'workspace' ? ctx.entry.scope.projectId : null;
    try {
      setProjectSkillEnabled(getDb(), projectId, skillId, enabled);
      return { ok: true, skills: skillsFor(ctx.entry) };
    } catch (err) {
      log.warn('skills:toggle failed', { message: errorMessage(err) });
      return fail(errorMessage(err));
    }
  });

  ipcMain.handle('skills:import', async (event): Promise<SkillsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    const picked = await dialog.showOpenDialog(ctx.win, {
      filters: [{ name: 'Skill Markdown', extensions: ['md'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return fail('No file selected');
    const file = picked.filePaths[0];
    if (file === undefined) return fail('No file selected');
    try {
      importSkillFile(getDb(), file);
      return { ok: true, skills: skillsFor(ctx.entry) };
    } catch (err) {
      log.warn('skills:import failed', { message: errorMessage(err) });
      return fail(errorMessage(err));
    }
  });
}
