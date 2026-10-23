import type {
  ClassifiedAction,
  ApprovalResult,
  ApprovalDecision,
} from '../types.js';
import { logger as log } from '../llm/logger.js';

// معرّف مراجعة فريد
function generateAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ApprovalStrategy {
  ask(action: ClassifiedAction, auditId: string): Promise<ApprovalDecision>;
}

let currentStrategy: ApprovalStrategy | null = null;

export function setApprovalStrategy(strategy: ApprovalStrategy): void {
  currentStrategy = strategy;
}

export function getApprovalStrategy(): ApprovalStrategy {
  if (!currentStrategy) {
    throw new Error(
      'Approval strategy not set. Call setApprovalStrategy() at startup.',
    );
  }
  return currentStrategy;
}

// ─── بوابة الموافقة ───

export async function requestApproval(
  action: ClassifiedAction,
): Promise<ApprovalResult> {
  const auditId = generateAuditId();

  // SAFE — موافقة تلقائية
  if (action.risk === 'safe') {
    log.info('Action auto-approved', {
      auditId,
      type: action.type,
      target: action.target,
    });
    return { decision: 'auto_approved', auditId };
  }

  // DANGEROUS — حجب فوري
  if (action.risk === 'dangerous') {
    log.warn('Action blocked', {
      auditId,
      type: action.type,
      target: action.target,
      explanation: action.explanation,
    });
    console.log('');
    console.log('🚫 عملية محجوبة تلقائيًا:');
    console.log(`   النوع: ${action.type}`);
    console.log(`   الهدف: ${action.target}`);
    console.log(`   السبب: ${action.explanation}`);
    console.log('');
    return { decision: 'blocked', auditId };
  }

  // REVIEW — نسأل المستخدم عبر الاستراتيجية المحقونة
  const decision = await getApprovalStrategy().ask(action, auditId);
  log.info('Approval decision', {
    auditId,
    decision,
    type: action.type,
  });
  return { decision, auditId };
}

// ─── للمكالمات غير التفاعلية (اختبارات، background) ───

export async function requestApprovalNonInteractive(
  action: ClassifiedAction,
  defaultDecision: ApprovalDecision = 'user_denied',
): Promise<ApprovalResult> {
  const auditId = generateAuditId();

  if (action.risk === 'safe') {
    return { decision: 'auto_approved', auditId };
  }
  if (action.risk === 'dangerous') {
    return { decision: 'blocked', auditId };
  }

  log.info('Non-interactive approval', {
    auditId,
    decision: defaultDecision,
    type: action.type,
  });
  return { decision: defaultDecision, auditId };
}