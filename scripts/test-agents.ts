import 'dotenv/config';
import { coderAgent } from '../src/agents/coder.js';
import { designerAgent } from '../src/agents/designer.js';
import type { Task, Context } from '../src/types.js';

async function testAgent(
  name: string,
  agent: typeof coderAgent,
  description: string,
): Promise<void> {
  const task: Task = {
    id: `test-${name}`,
    description,
    intent: name === 'coder' ? 'build' : 'design',
    agentName: agent.name,
    status: 'pending',
  };
  const context: Context = { memories: [] };

  console.log(`\n══════════════════════════════════════`);
  console.log(`AGENT: ${name.toUpperCase()}`);
  console.log(`TASK: ${description}`);
  console.log(`═════════════════════════════════════`);
  console.log('\n');

  const start = Date.now();
  const result = await agent.execute(task, context);
  const elapsed = Date.now() - start;

  console.log(result.content);
  console.log(`\n--- ${elapsed}ms ---\n`);
}

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  await testAgent(
    'coder',
    coderAgent,
    'اكتب دالة TypeScript تُرجع أكبر عنصر في مصفوفة أرقام. أضف اختبارًا لها.',
  );

  await testAgent(
    'designer',
    designerAgent,
    'صمم صفحة هبوط لتطبيق تعليمي عربي، مع نظام تصميم كامل.',
  );
}

main().catch((err) => {
  console.error('❌ TEST FAILED:');
  console.error(err);
  process.exit(1);
});