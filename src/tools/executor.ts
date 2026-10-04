import type { ProposedAction } from '../types.js';
import type { ApprovalResult } from '../types.js';
import { classifyAction } from '../security/risk-engine.js';
import { requestApproval } from '../security/approval.js';
import { writeAudit } from '../security/audit.js';
import { logger as log } from '../llm/logger.js';

// نتيجة تنفيذ عملية مع موافقة
export interface ExecutionResult<T = unknown> {
  approval: ApprovalResult;
  executed: boolean;
  result?: T;
  error?: string;
}

// ينفذ عملية بعد الموافقة. نقطة العبور الوحيدة للأدوات.
export async function executeWithApproval<T>(
  action: ProposedAction,
  executor: () => Promise<T>,
): Promise<ExecutionResult<T>> {
  const classified = classifyAction(action);

  log.info('Tool action proposed', {
    type: classified.type,
    target: classified.target,
    risk: classified.risk,
  });

  const approval = await requestApproval(classified);
  writeAudit(classified, approval);

  // لم يُوافق
  if (
    approval.decision === 'user_denied' ||
    approval.decision === 'blocked'
  ) {
    log.warn('Tool action not approved', {
      decision: approval.decision,
      type: classified.type,
      target: classified.target,
    });
    return {
      approval,
      executed: false,
      error: `Action not approved: ${approval.decision}`,
    };
  }

  // تمت الموافقة — نفّذ
  try {
    const result = await executor();
    log.info('Tool action executed', {
      type: classified.type,
      target: classified.target,
      auditId: approval.auditId,
    });
    return { approval, executed: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('Tool action failed', {
      type: classified.type,
      target: classified.target,
      message,
    });
    return {
      approval,
      executed: false,
      error: message,
    };
  }
}
