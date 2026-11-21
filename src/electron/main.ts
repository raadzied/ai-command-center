import 'dotenv/config';
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initDb, closeDb, getDb } from '../memory/db.js';
import { processInput } from '../core/loop.js';
import { setApprovalStrategy } from '../security/approval.js';
import { logger as log } from '../llm/logger.js';
import type { ApprovalDecision, ClassifiedAction } from '../types.js';
import { initializeAssistantSettings } from '../security/settings.js';
import { registerAssistantSettingsHandlers } from './settings-ipc.js';
import { registerVoiceHandlers } from './voice-ipc.js';

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

interface ProcessInputResult {
  ok: boolean;
  intent?: string;
  agentUsed?: string | null;
  content?: string;
  elapsedMs?: number;
  error?: string;
}

interface MemoryStatsResponse {
  conversations: number;
  decisions: number;
  projects: number;
  skills: number;
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
  if (resolve) {
    resolve(decision);
  }
}

function electronStrategy(): void {
  setApprovalStrategy({
    ask: (action: ClassifiedAction, auditId: string): Promise<ApprovalDecision> =>
      new Promise<ApprovalDecision>((resolve) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (approvalResolver || !win || win.isDestroyed()) {
          log.warn('Approval request denied without UI', { auditId });
          resolve('user_denied');
          return;
        }

        approvalResolver = resolve;
        pendingAuditId = auditId;

        approvalTimer = setTimeout(() => {
          log.warn('Approval timed out', { auditId });
          settleApproval('user_denied');
        }, APPROVAL_TIMEOUT_MS);

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
  if (!data || data.auditId !== pendingAuditId) {
    log.warn('Ignored stale approval response', { auditId: data?.auditId });
    return;
  }
  settleApproval(data.approved ? 'user_approved' : 'user_denied');
});

ipcMain.handle('memory:stats', (): MemoryStatsResponse => {
  return getDb()
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM conversations) AS conversations,
        (SELECT COUNT(*) FROM skills) AS skills,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM decisions) AS decisions`,
    )
    .get() as MemoryStatsResponse;
});

ipcMain.handle(
  'process:input',
  async (_event, text: unknown): Promise<ProcessInputResult> => {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, error: 'الطلب فارغ أو غير صالح' };
    }
    try {
      const result = await processInput(text, {
        onAgentActive: (agent) => {
          const wins = BrowserWindow.getAllWindows();
          if (wins[0]) wins[0].webContents.send('agent:active', agent);
        },
        onTaskStart: (index, total) => {
          const wins = BrowserWindow.getAllWindows();
          if (wins[0]) wins[0].webContents.send('task:start', { index, total });
        },
      });
      return {
        ok: true,
        intent: result.intent,
        agentUsed: result.agentUsed,
        content: result.content,
        elapsedMs: result.elapsedMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('processInput failed', { message: msg });
      return { ok: false, error: msg };
    }
  },
);

// تصدير بث الصوت من voice/tts.ts إلى Electron
registerAssistantSettingsHandlers();
registerVoiceHandlers();

async function createWindow(): Promise<void> {
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

  await win.loadFile(
    join(__dirname, '../../dist-renderer/index.html'),
  );

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
}

void app.whenReady().then(async (): Promise<void> => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' && webContents.getURL().startsWith('file://'));
  });
  initDb();
  initializeAssistantSettings();
  electronStrategy();
  log.info('Electron app ready');
  await createWindow();

  app.on('activate', (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', (): void => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', (): void => {
  closeDb();
});
