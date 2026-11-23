// Window registry for project/session isolation
// Maps BrowserWindow.webContents.id -> WindowEntry
// Ensures one window per project and proper scope tracking

import type { BrowserWindow } from 'electron';
import type { RunScope } from '../types.js';

export interface WindowEntry {
  win: BrowserWindow;
  scope: RunScope; // mutable for registry updates
  running: boolean;
}

const windows = new Map<number, WindowEntry>();

/**
 * Register a new window with its RunScope.
 * Called when a new BrowserWindow is created.
 */
export function registerWindow(win: BrowserWindow, scope: RunScope): void {
  const entry: WindowEntry = {
    win,
    scope,
    running: false,
  };
  windows.set(win.webContents.id, entry);

  // Update window title to reflect scope
  updateWindowTitle(win, scope);
}

/**
 * Unregister a window when it is closed.
 */
export function unregisterWindow(win: BrowserWindow): void {
  windows.delete(win.webContents.id);
}

/**
 * Get the WindowEntry for a given webContents id.
 */
export function getWindowEntry(webContentsId: number): WindowEntry | undefined {
  return windows.get(webContentsId);
}

/**
 * Update the scope of a window (e.g., when switching projects).
 */
export function updateWindowScope(win: BrowserWindow, scope: RunScope): void {
  const entry = windows.get(win.webContents.id);
  if (entry) {
    entry.scope = scope;
    updateWindowTitle(win, scope);
  }
}

/**
 * Set the running state of a window's current task.
 */
export function setWindowRunning(win: BrowserWindow, running: boolean): void {
  const entry = windows.get(win.webContents.id);
  if (entry) {
    entry.running = running;
  }
}

/**
 * Find a window entry by projectId.
 */
export function findWindowByProjectId(projectId: number | null): WindowEntry | undefined {
  for (const entry of windows.values()) {
    if (entry.scope.kind === 'workspace' ? entry.scope.projectId === projectId : entry.scope.kind === 'daily') {
      return entry;
    }
  }
  return undefined;
}

/**
 * List all registered window entries.
 */
export function listEntries(): WindowEntry[] {
  return Array.from(windows.values());
}

/**
 * Update the window title to reflect the current scope.
 */
function updateWindowTitle(win: BrowserWindow, scope: RunScope): void {
  let titlePart = '';
  if (scope.kind === 'daily') {
    titlePart = 'Daily Mode';
  } else if (scope.kind === 'workspace' && scope.projectId !== null) {
    titlePart = `Project ${scope.projectId}`;
  } else if (scope.kind === 'workspace' && scope.projectId === null) {
    titlePart = 'CLI Mode';
  }
  win.setTitle(`APEX — ${titlePart}`);
}

