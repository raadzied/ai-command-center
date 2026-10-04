import 'dotenv/config';
import { decompose } from '../src/core/decomposer.js';

const CASES: { input: string; expectMin: number; expectMax: number }[] = [
  {
    input: 'علّمني ما هو HTTP',
    expectMin: 1,
    expectMax: 1,
  },
  {
    input: 'اكتب دالة JavaScript تحسب مجموع مصفوفة',
    expectMin: 1,
    expectMax: 1,
  },
  {
    input: 'علّمني ما هو REST API، ثم اكتب دالة JavaScript تستدعي REST API',
    expectMin: 2,
    expectMax: 3,
  },
  {
    input: 'صمم واجهة تطبيق مذكرات، ثم اكتب كود React لها، ثم اختبر الكود',
    expectMin: 3,
    expectMax: 5,
  },
];

async function main(): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  console.log('=== Decomposer Test ===\n');
  let passed = 0;

  for (const c of CASES) {
    console.log(`INPUT: ${c.input}`);
    const tasks = await decompose(c.input);
    console.log(`  → ${tasks.length} مهمة`);
    for (const t of tasks) {
      console.log(
        `    [${t.id}] (${t.intent}) ${t.description.slice(0, 60)}... deps=[${t.dependsOn.join(',')}]`,
      );
    }
    const ok =
      tasks.length >= c.expectMin && tasks.length <= c.expectMax;
    console.log(ok ? '  ✓' : `  ✗ (expected ${c.expectMin}-${c.expectMax})`);
    console.log('');
    if (ok) passed++;
  }

  console.log(`\n=== ${passed}/${CASES.length} passed ===`);
  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ FAILED:', err);
  process.exit(1);
});
