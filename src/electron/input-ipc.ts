// Extracted IPC handlers from main.ts to keep it ≤ 200 lines.
// Uses event.sender for window resolution and processInputScoped for scoped runs.

import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { logger as log } from '../llm/logger.js';
import type { RunScope } from '../types.js';
import { processInputScoped } from '../core/loop.js';
import { RunCancelledError } from '../core/run-control.js';
import { getDb } from '../memory/db.js';
import { getWindowEntry, setWindowRunning } from './window-registry.js';
import { finishWindowRun, startWindowRun } from './run-ipc.js';

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

function winOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && !win.isDestroyed() ? win : null;
}

export function setupProcessInputIpc(): void {
  ipcMain.handle('process:input', async (event, text: unknown): Promise<ProcessInputResult> => {
    const win = winOf(event);
    if (!win) return { ok: false, error: 'Window not registered' };
    const entry = getWindowEntry(event.sender.id);
    if (!entry) return { ok: false, error: 'Window not registered in registry' };
    if (entry.running) return { ok: false, error: 'A task is already running in this window' };

    // Snapshot the scope before running; the run must not observe later switches.
    const snapshot: RunScope = { ...entry.scope };
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, error: 'الطلب فارغ أو غير صالح' };
    }
    setWindowRunning(win, true);
    const run = startWindowRun(event.sender);

    try {
      const result = await processInputScoped(text.trim(), snapshot, {
        signal: run.signal,
        onPhase: (phase, detail): void => run.setPhase(phase, detail),
        onAgentActive: (agent): void => {
          // Broadcast only to the sender, never getAllWindows()[0].
          event.sender.send('agent:active', agent);
        },
        onTaskStart: (index, total): void => {
          event.sender.send('task:start', { index, total });
        },
        // المرسِل فقط — لا بث عبر getAllWindows().
        onConsult: (payload): void => {
          event.sender.send('agent:consult', payload);
        },
        onActivity: (payload): void => {
          if (!event.sender.isDestroyed()) event.sender.send('hud:activity', payload);
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
      if (err instanceof RunCancelledError) {
        log.info('processInput cancelled', { senderId: event.sender.id });
        return { ok: false, error: 'Run cancelled' };
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error('processInput failed', { message: msg });
      return { ok: false, error: msg };
    } finally {
      finishWindowRun(event.sender.id);
      setWindowRunning(win, false);
    }
  });
}

export function setupMemoryStatsIpc(): void {
  ipcMain.handle('memory:stats', async (): Promise<MemoryStatsResponse> => {
    const row = getDb().prepare(
      `SELECT
        (SELECT COUNT(*) FROM conversations) AS conversations,
        (SELECT COUNT(*) FROM skills) AS skills,
        (SELECT COUNT(*) FROM projects) AS projects,
        (SELECT COUNT(*) FROM decisions) AS decisions`,
    ).get() as MemoryStatsResponse;
    return row;
  });
}
