import 'dotenv/config';
import { app, BrowserWindow, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initDb, closeDb, getDb } from '../memory/db.js';
import { createSession, listProjectSessions } from '../memory/sessions.js';
import { logger as log } from '../llm/logger.js';
import type { RunScope } from '../types.js';
import { initializeAssistantSettings } from '../security/settings.js';
import { registerAssistantSettingsHandlers } from './settings-ipc.js';
import { registerVoiceHandlers } from './voice-ipc.js';
import { setupProcessInputIpc, setupMemoryStatsIpc } from './input-ipc.js';
import { registerProjectHandlers } from './project-ipc.js';
import { registerSkillsHandlers } from './skills-ipc.js';
import { registerMcpHandlers } from './mcp-ipc.js';
import { registerHudSnapshotHandler } from './hud-snapshot-ipc.js';
import { registerBriefHandlers } from './brief-ipc.js';
import { cancelWindowRun, registerRunHandlers } from './run-ipc.js';
import { registerWindow, unregisterWindow } from './window-registry.js';
import { cancelAllApprovals, initElectronApprovalStrategy } from './approval-bridge.js';
import { disconnectAllForWindow } from '../tools/mcp-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Reuses the most recent daily session; creates one only when none exists. */
function dailyScope(windowId: number): RunScope {
  const reused = listProjectSessions(getDb(), null, 1)[0];
  return {
    kind: 'daily', windowId,
    sessionId: reused ? reused.id : createSession(getDb(), null),
  };
}

/** Creates a fully registered HUD window. Each project gets its own window. */
export function createMainWindow(initialScope?: RunScope): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0e1a',
    autoHideMenuBar: true,
  });
  const wcId = win.webContents.id;
  // The creator cannot know the window id in advance — bind it here.
  const scope: RunScope = initialScope
    ? { ...initialScope, windowId: win.id }
    : dailyScope(win.id);
  registerWindow(win, scope);

  void win.loadFile(join(__dirname, '../../dist-renderer/index.html'));
  // DevTools is opt-in only: APEX_DEVTOOLS=1. Ctrl+Shift+I still opens it manually.
  if (process.env.APEX_DEVTOOLS === '1') win.webContents.openDevTools();

  win.on('closed', (): void => {
    cancelWindowRun(wcId);
    void disconnectAllForWindow(wcId);
    unregisterWindow(win);
  });
  return win;
}

// --- Single instance: request BEFORE whenReady ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (): void => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async (): Promise<void> => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback): void => {
      callback(permission === 'media' && webContents.getURL().startsWith('file://'));
    });
    initDb();
    initializeAssistantSettings();
    initElectronApprovalStrategy();

    registerProjectHandlers(createMainWindow);
    registerSkillsHandlers();
    registerMcpHandlers();
    registerHudSnapshotHandler();
    registerBriefHandlers();
    registerRunHandlers();
    setupProcessInputIpc();
    setupMemoryStatsIpc();
    registerAssistantSettingsHandlers();
    registerVoiceHandlers();

    log.info('Electron app ready');
    createMainWindow();

    app.on('activate', (): void => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') {
      closeDb();
      app.quit();
    }
  });

  app.on('before-quit', (): void => {
    cancelAllApprovals();
    for (const win of BrowserWindow.getAllWindows()) {
      void disconnectAllForWindow(win.webContents.id);
    }
  });

  app.on('will-quit', (): void => {
    closeDb();
  });
}
