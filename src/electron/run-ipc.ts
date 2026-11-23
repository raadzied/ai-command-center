import { ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { createRunController } from '../core/run-control.js';
import type { RunController } from '../core/run-control.js';
import { cancelWindowApproval } from './approval-bridge.js';
import { cancelSpeech } from '../voice/state.js';

const activeRuns = new Map<number, RunController>();

function sendPhase(webContents: WebContents, phase: string, detail?: string): void {
  if (!webContents.isDestroyed()) {
    webContents.send('run:phase', detail === undefined ? { phase } : { phase, detail });
  }
}

export function startWindowRun(webContents: WebContents): RunController {
  const id = webContents.id;
  if (activeRuns.has(id)) throw new Error('A run is already active in this window');
  const controller = createRunController((phase, detail): void => sendPhase(webContents, phase, detail));
  activeRuns.set(id, controller);
  return controller;
}

export function finishWindowRun(webContentsId: number): void {
  activeRuns.delete(webContentsId);
}

export function cancelWindowRun(webContentsId: number): boolean {
  const controller = activeRuns.get(webContentsId);
  controller?.cancel();
  cancelWindowApproval(webContentsId);
  cancelSpeech();
  return controller !== undefined;
}

export function registerRunHandlers(): void {
  ipcMain.handle('run:cancel', async (event): Promise<{ ok: boolean; cancelled: boolean }> => ({
    ok: true,
    cancelled: cancelWindowRun(event.sender.id),
  }));
}
