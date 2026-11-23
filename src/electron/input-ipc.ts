// Extracted IPC handlers from main.ts to keep it ≤ 200 lines.
// Uses event.sender for window resolution and processInputScoped for scoped runs.

import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { logger as log } from '../llm/logger.js';
import type { RunScope } from '../types.js';
import { processInputScoped } from '../core/loop.js';
import { getDb } from '../memory/db.js';
import { getWindowEntry, setWindowRunning } from './window-registry.js';

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
    setWindowRunning(win, true);

    try {
      if (typeof text !== 'string' || text.trim().length === 0) {
        return { ok: false, error: 'الطلب فارغ أو غير صالح' };
      }
      const result = await processInputScoped(text.trim(), snapshot, {
        onAgentActive: (agent): void => {
          // Broadcast only to the sender, never getAllWindows()[0].
          event.sender.send('agent:active', agent);
        },
        onTaskStart: (index, total): void => {
          event.sender.send('task:start', { index, total });
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
    } finally {
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
