import 'dotenv/config';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initDb, closeDb, getDb } from '../memory/db.js';
import { createSession } from '../memory/sessions.js';
import { setApprovalStrategy } from '../security/approval.js';
import { logger as log } from '../llm/logger.js';
import type { ApprovalDecision, ClassifiedAction, RunScope } from '../types.js';
import { initializeAssistantSettings } from '../security/settings.js';
import { registerAssistantSettingsHandlers } from './settings-ipc.js';
import { registerVoiceHandlers } from './voice-ipc.js';
import { setupProcessInputIpc, setupMemoryStatsIpc } from './input-ipc.js';
import { registerProjectHandlers } from './project-ipc.js';
import { registerWindow, unregisterWindow } from './window-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APPROVAL_TIMEOUT_MS = 120_000;

interface ApprovalRequestPayload {
  auditId: string;
  action: {
    type: string;
    target: string;
    reason: string;
    risk: string;
    explanation: string;
  };
}

interface ApprovalResponse {
  auditId: string;
  approved: boolean;
}

let approvalResolver: ((decision: ApprovalDecision) => void) | null = null;
let approvalTimer: NodeJS.Timeout | null = null;
let pendingAuditId: string | null = null;

function settleApproval(decision: ApprovalDecision): void {
  const resolve = approvalResolver;
  approvalResolver = null;
  pendingAuditId = null;
  if (approvalTimer) {
    clearTimeout(approvalTimer);
    approvalTimer = null;
  }
  if (resolve) resolve(decision);
}

function electronStrategy(): void {
  setApprovalStrategy({
    ask: (action: ClassifiedAction, auditId: string): Promise<ApprovalDecision> =>
      new Promise<ApprovalDecision>((resolve) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (approvalResolver || !win || win.isDestroyed()) {
          resolve('user_denied');
          return;
        }
        approvalResolver = resolve;
        pendingAuditId = auditId;
        approvalTimer = setTimeout(() => settleApproval('user_denied'), APPROVAL_TIMEOUT_MS);
        const payload: ApprovalRequestPayload = {
          auditId,
          action: {
            type: action.type,
            target: action.target,
            reason: action.reason,
            risk: action.risk,
            explanation: action.explanation,
          },
        };
        win.webContents.send('approval:request', payload);
      }),
  });
}

ipcMain.on('approval:response', (_event, data: ApprovalResponse): void => {
  if (!data || data.auditId !== pendingAuditId) return;
  settleApproval(data.approved ? 'user_approved' : 'user_denied');
});

// --- Single instance: request BEFORE whenReady ---
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (): void => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  function createWindow(): void {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      backgroundColor: '#0a0e1a',
    });

    // Daily mode with an active daily session by default.
    const dailySessionId = createSession(getDb(), null);
    const scope: RunScope = {
      kind: 'daily', windowId: win.id, sessionId: dailySessionId,
    };
    registerWindow(win, scope);

    void win.loadFile(join(__dirname, '../../dist-renderer/index.html'));
    if (!app.isPackaged) win.webContents.openDevTools();

    win.on('closed', (): void => {
      unregisterWindow(win);
    });
  }

  void app.whenReady().then(async (): Promise<void> => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback): void => {
      callback(permission === 'media' && webContents.getURL().startsWith('file://'));
    });
    initDb();
    initializeAssistantSettings();
    electronStrategy();

    registerProjectHandlers();
    setupProcessInputIpc();
    setupMemoryStatsIpc();
    registerAssistantSettingsHandlers();
    registerVoiceHandlers();

    log.info('Electron app ready');
    createWindow();

    app.on('activate', (): void => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') {
      closeDb();
      app.quit();
    }
  });

  app.on('will-quit', (): void => {
    closeDb();
  });
}
