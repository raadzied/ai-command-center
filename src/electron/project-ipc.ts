// IPC handlers for projects and sessions.
// All handlers resolve their window from event.sender — never from a captured
// BrowserWindow and never from a raw path supplied by the renderer.

import { dialog, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { parse } from 'node:path';
import { existsSync } from 'node:fs';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import type { RunScope } from '../types.js';
import { normalizeRootPath, listWorkspaceProjects, openWorkspaceProject, getWorkspaceProject } from '../memory/projects.js';
import { createSession, deleteSession, getRecentSessionMessages, listProjectSessions, renameSession } from '../memory/sessions.js';
import { getWindowEntry, findWindowByProjectId, setWindowRunning, updateWindowScope } from './window-registry.js';
import type { WindowEntry } from './window-registry.js';

interface OkResult { ok: boolean; error?: string; }
interface PickResult extends OkResult { projectId?: number; sessionId?: number | null; }
interface SwitchResult extends OkResult { scope?: RunScope; }
interface CreateResult extends OkResult { sessionId?: number; }
interface OpenWindowResult extends OkResult { focusedExisting?: boolean; }
type WindowCreator = (scope: RunScope) => BrowserWindow;
interface MessagesResult extends OkResult { messages: Array<{ role: 'user' | 'agent'; content: string; agentName: string | null }>; }
interface ContextResult extends OkResult { scope?: RunScope; dailyMode?: boolean; projects?: Array<{ id: number; name: string; rootPath: string }>; sessions?: Array<{ id: number; title: string }>; activeSessionId?: number | null; }

const FORBIDDEN_FOLDERS = new Set(['windows', 'program files', 'program files (x86)', 'system32']);

function contextOf(event: IpcMainInvokeEvent): { win: BrowserWindow; entry: WindowEntry } | null {
  const entry = getWindowEntry(event.sender.id);
  const win = BrowserWindow.fromWebContents(event.sender);
  return !entry || !win || win.isDestroyed() ? null : { win, entry };
}

function fail(message: string): OkResult { return { ok: false, error: message }; }

/** Validates a folder chosen via the main-process dialog. Returns error or null. */
function validateFolder(picked: string): string | null {
  try {
    const normalized = normalizeRootPath(picked);
    const root = parse(normalized).root;
    if (normalized === root) return 'Cannot use a drive root as a project folder.';
    const first = normalized.slice(root.length).split(/[\\/]+/).filter(Boolean)[0];
    return first !== undefined && FORBIDDEN_FOLDERS.has(first.toLowerCase())
      ? 'Cannot use a system folder as a project folder.' : null;
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid folder';
  }
}

function currentProjectId(scope: RunScope): number | null { return scope.kind === 'workspace' ? scope.projectId : null; }

function resolveSession(db: ReturnType<typeof getDb>, projectId: number | null, requested: number | null): number | null {
  const sessions = listProjectSessions(db, projectId, 50);
  if (requested !== null && sessions.some((s) => s.id === requested)) return requested;
  return sessions[0]?.id ?? createSession(db, projectId);
}

/** Builds the workspace context payload shared by context/rename/delete. */
function contextResult(entry: WindowEntry): ContextResult {
  const db = getDb();
  const projectId = currentProjectId(entry.scope);
  return {
    ok: true, scope: entry.scope, dailyMode: entry.scope.kind === 'daily',
    projects: listWorkspaceProjects(db).map((p) => ({ id: p.id, name: p.name, rootPath: p.rootPath })),
    sessions: listProjectSessions(db, projectId).map((s) => ({ id: s.id, title: s.title })), activeSessionId: entry.scope.sessionId,
  };
}

/** Returns an error when the session belongs to another project/daily scope. */
function ownedSession(db: ReturnType<typeof getDb>, entry: WindowEntry, sessionId: number): string | null {
  const sessions = listProjectSessions(db, currentProjectId(entry.scope));
  return sessions.some((s) => s.id === sessionId) ? null : 'Session does not belong to this project';
}

/** Registers all nine workspace IPC handlers. */
export function registerProjectHandlers(createWindow: WindowCreator): void {
  // workspace:context — current scope, project list, project/daily sessions
  ipcMain.handle('workspace:context', async (event): Promise<ContextResult> => {
    const ctx = contextOf(event);
    return ctx ? contextResult(ctx.entry) : { ok: false, error: 'Window not registered' };
  });

  // workspace:open-window — focus an existing project window or create a new one
  ipcMain.handle('workspace:open-window', async (_event, projectId: number): Promise<OpenWindowResult> => {
    const refuse = (message: string): OpenWindowResult => {
      log.warn('workspace:open-window rejected', { projectId, reason: message }); return fail(message);
    };
    if (!Number.isInteger(projectId)) return refuse('Invalid project id');
    const existing = findWindowByProjectId(projectId);
    if (existing && !existing.win.isDestroyed()) {
      existing.win.restore(); existing.win.focus();
      log.info('workspace:open-window', { projectId, focusedExisting: true }); return { ok: true, focusedExisting: true };
    }
    const project = getWorkspaceProject(getDb(), projectId);
    if (!project) return refuse('Project not found');
    if (project.rootPath.trim() === '') return refuse('Project has no folder');
    if (!existsSync(project.rootPath)) return refuse(`Project folder missing: ${project.rootPath}`);
    const sessionId = resolveSession(getDb(), projectId, null);
    const scope: RunScope = { kind: 'workspace', windowId: null, projectId, sessionId, workspaceRoot: project.rootPath };
    createWindow(scope).focus();
    log.info('workspace:open-window', { projectId, focusedExisting: false }); return { ok: true, focusedExisting: false };
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
      const scope: RunScope = { kind: 'workspace', windowId: ctx.win.id, projectId: project.id, sessionId, workspaceRoot: project.rootPath };
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
    let rootPath = '';
    if (projectId !== null) {
      const project = getWorkspaceProject(db, projectId);
      if (!project) return fail('Project not found');
      rootPath = project.rootPath;
      if (rootPath.trim() === '') return fail('Project has no folder — pick a folder for it first.');
      if (!existsSync(rootPath)) return fail(`Project folder missing on disk: ${rootPath}`);
    }
    const scope: RunScope = projectId === null
      ? { kind: 'daily', windowId: ctx.win.id, sessionId: resolved }
      : { kind: 'workspace', windowId: ctx.win.id, projectId, sessionId: resolved, workspaceRoot: rootPath };
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
    const owned = ownedSession(db, ctx.entry, sessionId);
    if (owned !== null) return fail(owned);
    updateWindowScope(ctx.win, { ...ctx.entry.scope, sessionId });
    setWindowRunning(ctx.win, false);
    return { ok: true };
  });

  // workspace:session:rename — trims to 80 chars, rejects empty, returns context
  ipcMain.handle('workspace:session:rename', async (event, sessionId: number, newName: string): Promise<ContextResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    const db = getDb();
    const owned = ownedSession(db, ctx.entry, sessionId);
    if (owned !== null) return fail(owned);
    const title = newName.trim().slice(0, 80);
    if (title.length === 0) return fail('Session name cannot be empty');
    try {
      renameSession(db, sessionId, title);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Rename failed');
    }
    if (ctx.entry.scope.sessionId === sessionId) ctx.win.setTitle(`APEX — ${title}`);
    return contextResult(ctx.entry);
  });

  // workspace:session:delete — refuses while running; rebinds the active scope
  ipcMain.handle('workspace:session:delete', async (event, sessionId: number): Promise<ContextResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (ctx.entry.running) return fail('Cannot delete a session while a task is running');
    const db = getDb();
    const owned = ownedSession(db, ctx.entry, sessionId);
    if (owned !== null) return fail(owned);
    if (!deleteSession(db, sessionId)) return fail('Session not found');
    if (ctx.entry.scope.sessionId === sessionId) {
      const projectId = currentProjectId(ctx.entry.scope);
      const next = listProjectSessions(db, projectId, 1)[0];
      const nextId = next ? next.id : createSession(db, projectId);
      updateWindowScope(ctx.win, { ...ctx.entry.scope, sessionId: nextId });
    }
    return contextResult(ctx.entry);
  });

  // workspace:session:messages — last 100 messages for the Inspector
  ipcMain.handle('workspace:session:messages', async (event): Promise<MessagesResult> => {
    const ctx = contextOf(event);
    if (!ctx || ctx.entry.scope.sessionId === null) return { ok: true, messages: [] };
    const rows = getRecentSessionMessages(getDb(), ctx.entry.scope.sessionId, 100);
    return { ok: true, messages: rows.map((r) => ({ role: r.role, content: r.content, agentName: r.agentName })) };
  });
}
