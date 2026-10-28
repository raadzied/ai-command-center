import React, { useEffect } from 'react';
import type { ApprovalRequestData } from './window';

interface ApprovalModalProps {
  request: ApprovalRequestData | null;
  onRespond: (approved: boolean) => void;
}

function riskClass(risk: string): string {
  if (risk === 'dangerous') return 'risk-high';
  if (risk === 'review') return 'risk-medium';
  return 'risk-low';
}

export function ApprovalModal({
  request,
  onRespond,
}: ApprovalModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!request) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onRespond(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [request, onRespond]);

  if (!request) return null;

  const { action } = request;
  const risk = riskClass(action.risk);

  return (
    <div className="modal-overlay" onClick={() => onRespond(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-header ${risk}`}>
          <span className="modal-title">⚠ APPROVAL REQUIRED</span>
          <span className={`risk-badge ${risk}`}>{action.risk}</span>
        </div>
        <div className="modal-body">
          <div className="modal-detail">
            <span className="modal-detail-label">Action</span>
            <span className="modal-detail-value">{action.type}</span>
            <span className="modal-detail-label">Target</span>
            <span className="modal-detail-value">{action.target}</span>
            <span className="modal-detail-label">Reason</span>
            <span className="modal-detail-value">{action.reason}</span>
          </div>
          <div className="modal-explanation">
            {action.explanation}
          </div>
        </div>
        <div className="modal-actions">
          <span className="hint-esc">ESC = REJECT</span>
          <button className="btn btn-reject" onClick={() => onRespond(false)}>
            REJECT
          </button>
          <button className="btn btn-approve" onClick={() => onRespond(true)}>
            APPROVE
          </button>
        </div>
      </div>
    </div>
  );
}
