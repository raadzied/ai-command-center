// IPC handlers for projects and sessions.
// All handlers resolve their window from event.sender — never from a captured
// BrowserWindow and never from a raw path supplied by the renderer.

import { dialog, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { parse } from 'node:path';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import type { RunScope } from '../types.js';
import { normalizeRootPath, listWorkspaceProjects, openWorkspaceProject } from '../memory/projects.js';
import { createSession, getRecentSessionMessages, listProjectSessions, renameSession } from '../memory/sessions.js';
import { getWindowEntry, setWindowRunning, updateWindowScope } from './window-registry.js';
import type { WindowEntry } from './window-registry.js';

interface OkResult { ok: boolean; error?: string; }
interface PickResult extends OkResult { projectId?: number; sessionId?: number | null; }
interface SwitchResult extends OkResult { scope?: RunScope; }
interface CreateResult extends OkResult { sessionId?: number; }
interface MessagesResult extends OkResult {
  messages: Array<{ role: 'user' | 'agent'; content: string; agentName: string | null }>;
}
interface ContextResult extends OkResult {
  scope?: RunScope;
  dailyMode?: boolean;
  projects?: Array<{ id: number; name: string; rootPath: string }>;
  sessions?: Array<{ id: number; title: string }>;
  activeSessionId?: number | null;
}

const FORBIDDEN_FOLDERS = new Set([
  'windows', 'program files', 'program files (x86)', 'system32',
]);

function contextOf(event: IpcMainInvokeEvent): { win: BrowserWindow; entry: WindowEntry } | null {
  const entry = getWindowEntry(event.sender.id);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!entry || !win || win.isDestroyed()) return null;
  return { win, entry };
}

function fail(message: string): OkResult {
  return { ok: false, error: message };
}

/** Validates a folder chosen via the main-process dialog. Returns error or null. */
function validateFolder(picked: string): string | null {
  try {
    const normalized = normalizeRootPath(picked);
    const root = parse(normalized).root;
    if (normalized === root) return 'Cannot use a drive root as a project folder.';
    const firstSegment = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean)[0];
    if (firstSegment !== undefined && FORBIDDEN_FOLDERS.has(firstSegment.toLowerCase())) {
      return 'Cannot use a system folder as a project folder.';
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid folder';
  }
}

function currentProjectId(scope: RunScope): number | null {
  return scope.kind === 'workspace' ? scope.projectId : null;
}

function resolveSession(
  db: ReturnType<typeof getDb>,
  projectId: number | null,
  requested: number | null,
): number | null {
  const sessions = listProjectSessions(db, projectId, 50);
  if (requested !== null && sessions.some((s) => s.id === requested)) return requested;
  return sessions[0]?.id ?? createSession(db, projectId);
}

/** Registers all seven workspace IPC handlers. */
export function registerProjectHandlers(): void {
  // workspace:context — current scope, project list, project/daily sessions
  ipcMain.handle('workspace:context', async (event): Promise<ContextResult> => {
    const ctx = contextOf(event);
    if (!ctx) return { ok: false, error: 'Window not registered' };
    const db = getDb();
    const projectId = currentProjectId(ctx.entry.scope);
    const projects = listWorkspaceProjects(db).map((p) => ({
      id: p.id, name: p.name, rootPath: p.rootPath,
    }));
    const sessions = listProjectSessions(db, projectId).map((s) => ({
      id: s.id, title: s.title,
    }));
    return {
      ok: true,
      scope: ctx.entry.scope,
      dailyMode: ctx.entry.scope.kind === 'daily',
      projects,
      sessions,
      activeSessionId: ctx.entry.scope.sessionId,
    };
  });

  // workspace:pick-folder — dialog opened in main; path validated via realpath
  ipcMain.handle('workspace:pick-folder', async (event): Promise<PickResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (ctx.entry.running) return fail('Cannot switch project while a task is running');
    const picked = await dialog.showOpenDialog(ctx.win, { properties: ['openDirectory'] });
    if (picked.canceled || picked.filePaths.length === 0) return fail('No folder selected');
    const candidate = picked.filePaths[0];
    if (candidate === undefined) return fail('No folder selected');
    const error = validateFolder(candidate);
    if (error !== null) return fail(error);
    try {
      const db = getDb();
      const project = openWorkspaceProject(db, candidate);
      const sessionId = resolveSession(db, project.id, null);
      const scope: RunScope = {
        kind: 'workspace', windowId: ctx.win.id, projectId: project.id,
        sessionId, workspaceRoot: project.rootPath,
      };
      updateWindowScope(ctx.win, scope);
      setWindowRunning(ctx.win, false);
      return { ok: true, projectId: project.id, sessionId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open project';
      log.error('pick-folder failed', { message: msg });
      return fail(msg);
    }
  });

  // workspace:switch-project — projectId null = daily mode
  ipcMain.handle('workspace:switch-project', async (event, projectId: number | null, sessionId: number | null): Promise<SwitchResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (ctx.entry.running) return fail('Cannot switch project while a task is running');
    const db = getDb();
    const resolved = resolveSession(db, projectId, sessionId);
    const scope: RunScope = projectId === null
      ? { kind: 'daily', windowId: ctx.win.id, sessionId: resolved }
      : { kind: 'workspace', windowId: ctx.win.id, projectId, sessionId: resolved, workspaceRoot: '' };
    updateWindowScope(ctx.win, scope);
    setWindowRunning(ctx.win, false);
    return { ok: true, scope };
  });

  // workspace:session:create
  ipcMain.handle('workspace:session:create', async (event): Promise<CreateResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    const db = getDb();
    const sessionId = createSession(db, currentProjectId(ctx.entry.scope));
    const scope: RunScope = { ...ctx.entry.scope, sessionId };
    updateWindowScope(ctx.win, scope);
    return { ok: true, sessionId };
  });

  // workspace:session:select — refuses while a task is running
  ipcMain.handle('workspace:session:select', async (event, sessionId: number): Promise<OkResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (ctx.entry.running) return fail('Cannot switch session while a task is running');
    const db = getDb();
    const sessions = listProjectSessions(db, currentProjectId(ctx.entry.scope));
    if (!sessions.some((s) => s.id === sessionId)) return fail('Session does not belong to this project');
    updateWindowScope(ctx.win, { ...ctx.entry.scope, sessionId });
    setWindowRunning(ctx.win, false);
    return { ok: true };
  });

  // workspace:session:rename
  ipcMain.handle('workspace:session:rename', async (event, newName: string): Promise<OkResult> => {
    const ctx = contextOf(event);
    if (!ctx || ctx.entry.scope.sessionId === null) return fail('No session active');
    try {
      renameSession(getDb(), ctx.entry.scope.sessionId, newName);
      return { ok: true };
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Rename failed');
    }
  });

  // workspace:session:messages — last 100 messages for the Inspector
  ipcMain.handle('workspace:session:messages', async (event): Promise<MessagesResult> => {
    const ctx = contextOf(event);
    if (!ctx || ctx.entry.scope.sessionId === null) return { ok: true, messages: [] };
    const rows = getRecentSessionMessages(getDb(), ctx.entry.scope.sessionId, 100);
    return {
      ok: true,
      messages: rows.map((r) => ({ role: r.role, content: r.content, agentName: r.agentName })),
    };
  });
}
