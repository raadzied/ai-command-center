import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
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

  // REVIEW — نسأل المستخدم
  return await askUser(action, auditId);
}

// ─── التفاعل مع المستخدم ───

async function askUser(
  action: ClassifiedAction,
  auditId: string,
): Promise<ApprovalResult> {
  console.log('');
  console.log('⚠️  عملية تحتاج موافقتك:');
  console.log(`   النوع: ${action.type}`);
  console.log(`   الهدف: ${action.target}`);
  console.log(`   السبب: ${action.reason}`);
  console.log(`   التصنيف: ${action.explanation}`);
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  let decision: ApprovalDecision = 'user_denied';

  try {
    const answer = await rl.question('موافقتك؟ [y/N]: ');
    const normalized = answer.trim().toLowerCase();
    if (normalized === 'y' || normalized === 'yes') {
      decision = 'user_approved';
    }
  } finally {
    rl.close();
  }

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
