import React from 'react';
import type { ApprovalRequestData } from './window';

interface ApprovalModalProps {
  request: ApprovalRequestData | null;
  onRespond: (approved: boolean) => void;
}

export function ApprovalModal({ request, onRespond }: ApprovalModalProps): React.JSX.Element | null {
  if (!request) return null;

  const { action } = request;

  return (
    <div className="approval-modal">
      <div className="approval-content">
        <h2>⚠️ عملية تحتاج موافقتك</h2>
        <div className="approval-details">
          <div><strong>النوع:</strong> <span>{action.type}</span></div>
          <div><strong>الهدف:</strong> <span>{action.target}</span></div>
          <div><strong>السبب:</strong> <span>{action.reason}</span></div>
          <div><strong>التصنيف:</strong> <span>{action.explanation}</span></div>
        </div>
        <div className="approval-buttons">
          <button
            type="button"
            className="btn-approve"
            onClick={() => onRespond(true)}
          >
            موافقة
          </button>
          <button
            type="button"
            className="btn-deny"
            onClick={() => onRespond(false)}
          >
            رفض
          </button>
        </div>
      </div>
    </div>
  );
}
