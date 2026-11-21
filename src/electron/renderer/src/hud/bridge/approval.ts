import type { ApprovalRequestData } from '../../window';
import { esc } from '../dom';
import type { ApexHudApi } from '../types';

let timer: number | null = null;

export function hideApprovalModal(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  document.getElementById('bridge-approval')?.remove();
}

/** Human-in-the-loop approval gate, styled with the HUD palette. */
export function showApprovalModal(app: ApexHudApi, request: ApprovalRequestData): void {
  hideApprovalModal();
  const action = request.action;

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
        <div class="ins-row"><span class="ins-label">TYPE</span><span>${esc(action.type)}</span></div>
        <div class="ins-row"><span class="ins-label">TARGET</span><span>${esc(action.target)}</span></div>
        <div class="ins-row"><span class="ins-label">RISK</span><span>${esc(action.risk)}</span></div>
        <div class="ins-row"><span class="ins-label">REASON</span><span>${esc(action.reason)}</span></div>
      </div>
      <div class="approval-actions">
        <button id="bridge-approve" class="approval-approve" type="button">Approve</button>
        <button id="bridge-deny" class="approval-deny" type="button">Deny</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const decide = (approved: boolean): void => {
    window.api.respondApproval(request.auditId, approved);
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
    app.addSystemLog('Approval', 'Timed out — denied by default');
  }, 115_000);
}
