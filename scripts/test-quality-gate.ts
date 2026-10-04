import 'dotenv/config';
import { evaluateQuality } from '../src/core/quality-gate.js';

// رد ناقص عمدًا — يجب أن يفشل
const BAD_CODER_OUTPUT = `هذه دالة تحسب المجموع:
function sum(a, b) { return a + b; }`;

// رد جيد — يجب أن ينجح
const GOOD_CODER_OUTPUT = `سأكتب دالة TypeScript تحسب مجموع مصفوفة أرقام، مع معالجة الحالة الفارغة.

\`\`\`typescript
function sumArray(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((acc, n) => acc + n, 0);
}
\`\`\`

**افتراضات:** المدخل مصفوفة أرقام. المصفوفة الفارغة ترجع 0.

**اختبار:**
\`\`\`typescript
console.log(sumArray([1, 2, 3]));   // 6
console.log(sumArray([]));          // 0
\`\`\``;

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  console.log('=== Quality Gate Test ===\n');

  console.log('--- Case 1: BAD output (should FAIL) ---');
  const bad = await evaluateQuality({
    agent: 'coder',
    task: 'اكتب دالة تحسب مجموع مصفوفة أرقام',
    output: BAD_CODER_OUTPUT,
  });
  console.log(JSON.stringify(bad, null, 2));
  console.log('');

  console.log('--- Case 2: GOOD output (should PASS) ---');
  const good = await evaluateQuality({
    agent: 'coder',
    task: 'اكتب دالة تحسب مجموع مصفوفة أرقام',
    output: GOOD_CODER_OUTPUT,
  });
  console.log(JSON.stringify(good, null, 2));
  console.log('');

  const correct =
    bad.status === 'FAIL' && good.status === 'PASS';
  console.log(correct ? '✅ TEST PASSED' : '❌ TEST FAILED');
  process.exit(correct ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ TEST ERROR:', err);
  process.exit(1);
});
