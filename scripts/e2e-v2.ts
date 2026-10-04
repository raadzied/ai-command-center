import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { initDb, closeDb } from '../src/memory/db.js';
import { processInput } from '../src/core/loop.js';

interface TestCase {
  id: string;
  label: string;
  input: string;
  expectedIntent?: string;
  expectedMultiTask?: boolean;
  notes?: string;
}

interface CaseResult {
  case: TestCase;
  intent: string;
  agentUsed: string | null;
  elapsedMs: number;
  contentPreview: string;
  contentLength: number;
  hasUnverified: boolean;
  hasMultiTaskHeaders: boolean;
  isApiFailure: boolean;
  timestamp: string;
}

const CASES: TestCase[] = [
  {
    id: 'case1-learn',
    label: 'مقارنة معرفية',
    input: 'ما الفرق بين API وSDK؟',
    expectedIntent: 'learn',
  },
  {
    id: 'case2-mentor',
    label: 'تعليم',
    input: 'علمني مفهوم closures في JavaScript بطريقة عملية',
    expectedIntent: 'learn',
  },
  {
    id: 'case3-coder',
    label: 'كود بسيط',
    input: 'اكتب دالة TypeScript تجمع أرقام مصفوفة مع معالجة المصفوفة الفارغة',
    expectedIntent: 'build',
  },
  {
    id: 'case4-designer',
    label: 'تصميم',
    input: 'صمم نظام ألوان وTypography لواجهة عربية SaaS حديثة',
    expectedIntent: 'design',
  },
  {
    id: 'case5-two-tasks',
    label: 'مهمتان',
    input: 'علمني ما هو REST API، ثم اكتب لي مثال TypeScript بسيط يستخدمه.',
    expectedMultiTask: true,
  },
  {
    id: 'case6-three-tasks',
    label: 'ثلاث مهام',
    input:
      'أريد إنشاء صفحة هبوط عربية لتطبيق إدارة مهام: ' +
      'حلل المتطلبات أولًا، ثم صمم نظام الواجهة، ثم اكتب نموذج HTML/CSS للصفحة.',
    expectedMultiTask: true,
  },
  {
    id: 'case9-fail-intent',
    label: 'فشل متعمد',
    input:
      'اكتب دالة TypeScript تقبل رقمًا كمدخل وتُرجع اسم المستخدم الصحيح ' +
      'دون أي mapping أو مصدر بيانات.',
    expectedIntent: 'build',
    notes: 'نراقب هل يُرجِع Quality Gate FAIL ثم retry',
  },
];

function hasMultiTaskHeaders(content: string): boolean {
  return content.includes('─── المهمة 1:');
}

async function runCase(tc: TestCase): Promise<CaseResult> {
  console.log(`\n══════════════════════════════════════════`);
  console.log(`CASE: ${tc.id} — ${tc.label}`);
  console.log(`INPUT: ${tc.input}`);
  console.log(`══════════════════════════════════════════\n`);

  const start = Date.now();
  const result = await processInput(tc.input);
  const elapsed = Date.now() - start;

  const caseResult: CaseResult = {
    case: tc,
    intent: result.intent,
    agentUsed: result.agentUsed,
    elapsedMs: elapsed,
    contentPreview: result.content.slice(0, 300),
    contentLength: result.content.length,
    hasUnverified: result.content.includes('⚠️ [بعض الردود'),
    hasMultiTaskHeaders: hasMultiTaskHeaders(result.content),
    isApiFailure:
      result.content.includes('Gemini chat failed') ||
      result.content.includes('All Groq chat models failed'),
    timestamp: new Date().toISOString(),
  };

  console.log(`→ intent: ${result.intent}`);
  console.log(`→ agent: ${result.agentUsed ?? 'chat'}`);
  console.log(`→ elapsed: ${elapsed}ms`);
  console.log(`→ content length: ${result.content.length}`);
  console.log(`→ multi-task: ${caseResult.hasMultiTaskHeaders}`);
  console.log(`→ unverified: ${caseResult.hasUnverified}`);
  console.log(`\n--- Preview ---\n${caseResult.contentPreview}...`);

  return caseResult;
}

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY || !process.env.GROQ_API_KEY) {
    throw new Error('Missing API keys in .env');
  }

  initDb();

  const results: CaseResult[] = [];

  for (const tc of CASES) {
    try {
      const r = await runCase(tc);
      results.push(r);
    } catch (err) {
      console.error(`❌ Case ${tc.id} threw:`, err);
      results.push({
        case: tc,
        intent: 'ERROR',
        agentUsed: null,
        elapsedMs: 0,
        contentPreview: err instanceof Error ? err.message : String(err),
        contentLength: 0,
        hasUnverified: false,
        hasMultiTaskHeaders: false,
        isApiFailure: false,
        timestamp: new Date().toISOString(),
      });
    }
  }

  closeDb();

  const reportPath = `./data/e2e-v2-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log(`\n══════════════════════════════════════════`);
  console.log(`FINAL SUMMARY`);
  console.log(`══════════════════════════════════════════\n`);

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const intentOk = r.case.expectedIntent
      ? r.intent === r.case.expectedIntent
      : true;
    const multiOk = r.case.expectedMultiTask
      ? r.hasMultiTaskHeaders
      : true;

    // فشل API (مزود خارجي) لا يُحتسب ضد النظام
    const ok = r.isApiFailure || (intentOk && multiOk);
    console.log(
      `${ok ? '✓' : '✗'} ${r.case.id}: intent=${r.intent} agent=${r.agentUsed ?? 'chat'} ${r.elapsedMs}ms`,
    );
    if (ok) passed++;
    else failed++;
  }

  console.log(`\nPassed: ${passed}/${results.length}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error('❌ E2E failed:', err);
  process.exit(1);
});
