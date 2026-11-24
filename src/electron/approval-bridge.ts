// Per-window approval isolation: one pending request at a time per window.
// Keyed by webContents.id so a response from another window cannot settle it.

import { BrowserWindow, ipcMain } from 'electron';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import { getWorkspaceProject } from '../memory/projects.js';
import { getSession } from '../memory/sessions.js';
import { setApprovalStrategy } from '../security/approval.js';
import { emitActivity } from '../core/hud-activity.js';
import type { ApprovalDecision, ClassifiedAction, RunScope } from '../types.js';
import type { FileDiffPreview } from '../tools/diff.js';
import { getWindowEntry } from './window-registry.js';

const APPROVAL_TIMEOUT_MS = 120_000;

interface PendingApproval {
  readonly auditId: string;
  readonly resolve: (decision: ApprovalDecision) => void;
  readonly timer: NodeJS.Timeout;
}

interface ApprovalRequestPayload {
  auditId: string;
  action: {
    type: string;
    target: string;
    reason: string;
    risk: string;
    explanation: string;
    preview?: FileDiffPreview;
  };
  projectName?: string;
  sessionTitle?: string;
}

interface ApprovalResponse {
  auditId: string;
  approved: boolean;
}

const byWindow = new Map<number, PendingApproval>();

function settle(webContentsId: number, decision: ApprovalDecision): void {
  const pending = byWindow.get(webContentsId);
  if (!pending) return;
  byWindow.delete(webContentsId);
  clearTimeout(pending.timer);
  pending.resolve(decision);
}

/** Called by main.ts when a window closes — denies and clears its request. */
export function cancelWindowApproval(webContentsId: number): void {
  settle(webContentsId, 'user_denied');
}

/** Called by main.ts on before-quit — denies every outstanding request. */
export function cancelAllApprovals(): void {
  for (const id of Array.from(byWindow.keys())) settle(id, 'user_denied');
}

function contextLabels(scope?: RunScope): { projectName?: string; sessionTitle?: string } {
  if (!scope) return {};
  try {
    const db = getDb();
    const projectName = scope.kind === 'workspace' && scope.projectId !== null
      ? getWorkspaceProject(db, scope.projectId)?.name
      : undefined;
    const sessionTitle = scope.sessionId !== null
      ? getSession(db, scope.sessionId)?.title
      : undefined;
    return {
      ...(projectName === undefined ? {} : { projectName }),
      ...(sessionTitle === undefined ? {} : { sessionTitle }),
    };
  } catch (err) {
    log.warn('Approval context labels unavailable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

/** Installs the Electron strategy and the sender-checked response listener. */
export function initElectronApprovalStrategy(): void {
  setApprovalStrategy({
    ask: (action: ClassifiedAction, auditId: string, scope?: RunScope): Promise<ApprovalDecision> =>
      new Promise<ApprovalDecision>((resolve) => {
        const scoped = scope?.windowId !== null && scope?.windowId !== undefined
          ? getWindowEntry(scope.windowId)?.win
          : undefined;
        const focused = scope === undefined ? BrowserWindow.getFocusedWindow() : undefined;
        const win = scoped ?? (focused && !focused.isDestroyed() ? focused : undefined);
        if (!win || win.isDestroyed() || byWindow.has(win.webContents.id)) {
          log.warn('Approval denied: no usable window or request already pending', {
            auditId, type: action.type,
          });
          resolve('user_denied');
          return;
        }
        const wcId = win.webContents.id;
        const timer = setTimeout((): void => settle(wcId, 'user_denied'), APPROVAL_TIMEOUT_MS);
        byWindow.set(wcId, { auditId, resolve, timer });
        const payload: ApprovalRequestPayload = {
          auditId,
          action: {
            type: action.type, target: action.target, reason: action.reason,
            risk: action.risk, explanation: action.explanation,
            ...(action.preview === undefined ? {} : { preview: action.preview }),
          },
          ...contextLabels(scope),
        };
        win.webContents.send('approval:request', payload);
        emitActivity((activity): void => {
          if (!win.webContents.isDestroyed()) win.webContents.send('hud:activity', activity);
        }, {
          nodeId: action.type === 'mcp_tool' ? 'mcp' : 'fs',
          state: 'active',
          detail: 'بانتظار الموافقة',
        });
        if (!win.isFocused()) win.flashFrame(true);
      }),
  });
}

/** True while this window has an unanswered approval request. */
export function hasPendingApproval(webContentsId: number): boolean {
  return byWindow.has(webContentsId);
}

ipcMain.on('approval:response', (event, data: ApprovalResponse): void => {
  if (!data || typeof data.auditId !== 'string') return;
  const pending = byWindow.get(event.sender.id);
  if (!pending || pending.auditId !== data.auditId) {
    log.warn('Approval response ignored: wrong window or auditId', {
      auditId: data.auditId, senderId: event.sender.id,
    });
    return;
  }
  settle(event.sender.id, data.approved ? 'user_approved' : 'user_denied');
});
