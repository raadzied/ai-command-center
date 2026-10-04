import 'dotenv/config';
import { createPlan, describePlan } from '../src/core/planner.js';
import { selectAgent } from '../src/core/router.js';

interface TestCase {
  input: string;
  expectedIntent: string;
}

const cases: TestCase[] = [
  { input: 'علّمني كيف تعمل الـ embeddings', expectedIntent: 'learn' },
  { input: 'اكتب دالة JavaScript تحسب مجموع مصفوفة', expectedIntent: 'build' },
  { input: 'صمم واجهة صفحة تسجيل الدخول', expectedIntent: 'design' },
  { input: 'مرحبًا، كيف حالك؟', expectedIntent: 'chat' },
];

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  console.log('=== Router + Planner Test ===\n');

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    console.log(`INPUT: ${tc.input}`);
    const plan = await createPlan(tc.input, { memories: [] });

    const intent = plan.intent;
    const ok = intent === tc.expectedIntent;

    console.log(`  intent: ${intent} (متوقع: ${tc.expectedIntent}) ${ok ? '✓' : '✗'}`);
    console.log(`  ${describePlan(plan)}`);

    if (!plan.isChat) {
      const agent = selectAgent(plan.tasks[0]);
      console.log(`  agent selected: ${agent?.name ?? 'none'}`);
    }

    if (ok) passed++;
    else failed++;

    console.log('');
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('❌ TEST FAILED:');
  console.error(err);
  process.exit(1);
});