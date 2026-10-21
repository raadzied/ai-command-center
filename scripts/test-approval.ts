import 'dotenv/config';
import { classifyAction } from '../src/security/risk-engine.js';
import { requestApprovalNonInteractive } from '../src/security/approval.js';
import { writeAudit, readRecentAudit } from '../src/security/audit.js';
import { initDb, closeDb } from '../src/memory/db.js';
import type { ProposedAction, RiskLevel } from '../src/types.js';

interface Case {
  label: string;
  action: ProposedAction;
  expectedRisk: RiskLevel;
}

const CASES: Case[] = [
  {
    label: 'قراءة ملف عادي',
    action: { type: 'file_read', target: 'src/index.ts', reason: 'قراءة للسياق' },
    expectedRisk: 'safe',
  },
  {
    label: 'كتابة ملف جديد',
    action: {
      type: 'file_write',
      target: 'src/new-file.ts',
      reason: 'إنشاء ملف جديد',
    },
    expectedRisk: 'safe',
  },
  {
    label: 'الكتابة فوق ملف موجود — تحتاج مراجعة',
    action: {
      type: 'file_write',
      target: 'src/existing-file.ts',
      reason: 'تعديل ملف قائم',
      overwrite: true,
    },
    expectedRisk: 'review',
  },
  {
    label: 'تعديل package.json',
    action: {
      type: 'file_write',
      target: 'package.json',
      reason: 'إضافة سكربت',
    },
    expectedRisk: 'review',
  },
  {
    label: 'تعديل ملف داخل .git',
    action: {
      type: 'file_write',
      target: '.git/config',
      reason: 'تعديل إعداد',
    },
    expectedRisk: 'dangerous',
  },
  {
    label: 'تعديل .env',
    action: {
      type: 'file_write',
      target: '.env',
      reason: 'إضافة مفتاح',
    },
    expectedRisk: 'dangerous',
  },
  {
    label: 'أمر terminal آمن',
    action: {
      type: 'terminal',
      target: 'ls -la',
      reason: 'عرض الملفات',
    },
    expectedRisk: 'safe',
  },
  {
    label: 'npm install',
    action: {
      type: 'terminal',
      target: 'npm install express',
      reason: 'إضافة مكتبة',
    },
    expectedRisk: 'review',
  },
  {
    label: 'rm -rf',
    action: {
      type: 'terminal',
      target: 'rm -rf /tmp/test',
      reason: 'حذف مجلد مؤقت',
    },
    expectedRisk: 'dangerous',
  },
  {
    label: 'git push --force',
    action: {
      type: 'git_operation',
      target: 'git push --force origin main',
      reason: 'دفع قسري',
    },
    expectedRisk: 'review',
  },
  {
    label: 'مسارات محمية نسبية',
    action: { type: 'file_write', target: '.env', reason: 'test' },
    expectedRisk: 'dangerous',
  },
  {
    label: '.env.local',
    action: { type: 'file_write', target: '.env.local', reason: 'test' },
    expectedRisk: 'dangerous',
  },
  {
    label: '.git/config نسبي',
    action: { type: 'file_write', target: '.git/config', reason: 'test' },
    expectedRisk: 'dangerous',
  },
  {
    label: 'node_modules مباشر',
    action: { type: 'file_write', target: 'node_modules/foo.js', reason: 'test' },
    expectedRisk: 'dangerous',
  },
  {
    label: 'package-lock.json مباشر',
    action: { type: 'file_write', target: 'package-lock.json', reason: 'test' },
    expectedRisk: 'dangerous',
  },
  {
    label: 'مسار مطلق .git',
    action: { type: 'file_write', target: 'E:\\project\\.git\\config', reason: 'test' },
    expectedRisk: 'dangerous',
  },
];

async function main(): Promise<void> {
  initDb();

  console.log('=== Approval System Test ===\n');

  let passed = 0;

  for (const c of CASES) {
    const classified = classifyAction(c.action);
    const ok = classified.risk === c.expectedRisk;

    console.log(`${ok ? '✓' : '✗'} ${c.label}`);
    console.log(`   risk: ${classified.risk} (متوقع: ${c.expectedRisk})`);
    console.log(`   explanation: ${classified.explanation}`);

    const approval = await requestApprovalNonInteractive(classified);
    writeAudit(classified, approval);
    console.log(`   decision: ${approval.decision}`);
    console.log('');

    if (ok) passed++;
  }

  const recent = readRecentAudit(5);
  console.log(`\nآخر ${recent.length} مدخل في audit_log:`);
  for (const r of recent) {
    console.log(`  [${r.risk}/${r.decision}] ${r.action_type} → ${r.target.slice(0, 40)}`);
  }

  closeDb();

  console.log(`\n=== ${passed}/${CASES.length} passed ===`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
