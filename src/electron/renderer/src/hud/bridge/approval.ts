import type { ApprovalRequestData, DiffPreview } from '../../window';
import { esc } from '../dom';
import { refreshHudSnapshot } from './snapshot';
import type { ApexHudApi } from '../types';

let timer: number | null = null;

export function hideApprovalModal(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  document.getElementById('bridge-approval')?.remove();
}

function diffBox(preview: DiffPreview): string {
  const body = preview.diff.split('\n').slice(2).map((line: string): string => {
    const kind = line.startsWith('+ ') ? 'diff-add'
      : line.startsWith('- ') ? 'diff-del' : 'diff-ctx';
    return `<div class="${kind}">${esc(line)}</div>`;
  }).join('');
  const label = preview.isNew ? 'NEW FILE' : 'MODIFY';
  return `<div class="diff-box">` +
    `<div class="diff-head"><span>${label}</span><span>+${preview.added} / -${preview.removed}</span></div>` +
    `<div class="diff-body">${body}</div></div>`;
}

/** Human-in-the-loop approval gate, styled with the HUD palette. */
export function showApprovalModal(app: ApexHudApi, request: ApprovalRequestData): void {
  hideApprovalModal();
  const action = request.action;
  const labels = [request.projectName, request.sessionTitle].filter(Boolean);
  const contextRow = labels.length === 0 ? '' :
    `<div class="ins-row"><span class="ins-label">CONTEXT</span>` +
    `<span dir="auto">${esc(labels.join(' / '))}</span></div>`;
  const previewRow = action.preview === undefined ? '' : diffBox(action.preview);

  const overlay = document.createElement('div');
  overlay.id = 'bridge-approval';
  overlay.className = 'approval-overlay';
  overlay.innerHTML = `
    <div class="approval-card">
      <div class="approval-head">
        <span class="status-dot" data-status="THINKING"></span>
        <div>
          <h2 class="approval-title">Approval Required</h2>
          <p class="approval-sub">HUMAN-IN-THE-LOOP GATE</p>
        </div>
      </div>
      <div class="approval-grid">
        ${contextRow}
        <div class="ins-row"><span class="ins-label">TYPE</span><span>${esc(action.type)}</span></div>
        <div class="ins-row"><span class="ins-label">TARGET</span><span>${esc(action.target)}</span></div>
        <div class="ins-row"><span class="ins-label">RISK</span><span>${esc(action.risk)}</span></div>
        <div class="ins-row"><span class="ins-label">REASON</span><span>${esc(action.reason)}</span></div>
      </div>
      ${previewRow}
      <div class="approval-actions">
        <button id="bridge-approve" class="approval-approve" type="button">Approve</button>
        <button id="bridge-deny" class="approval-deny" type="button">Deny</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const decide = (approved: boolean): void => {
    window.api.respondApproval(request.auditId, approved);
    void refreshHudSnapshot(app);
    app.addSystemLog(
      'Approval',
      `${approved ? 'Approved' : 'Denied'}: ${action.type} -> ${action.target}`,
    );
    app.showToast(approved ? 'Action approved' : 'Action denied');
    hideApprovalModal();
  };

  overlay.querySelector<HTMLButtonElement>('#bridge-approve')?.addEventListener('click', (): void => {
    decide(true);
  });
  overlay.querySelector<HTMLButtonElement>('#bridge-deny')?.addEventListener('click', (): void => {
    decide(false);
  });

  // The main process times out at 120s; close the overlay slightly earlier.
  timer = window.setTimeout((): void => {
    hideApprovalModal();
    void refreshHudSnapshot(app);
    app.addSystemLog('Approval', 'Timed out — denied by default');
  }, 115_000);
}
