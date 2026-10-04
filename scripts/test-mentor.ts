import 'dotenv/config';
import { mentorAgent } from '../src/agents/mentor.js';
import type { Task, Context } from '../src/types.js';

async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  // مهمة تجريبية
  const task: Task = {
    id: 'test-1',
    description: 'علّمني كيف تعمل الـ embeddings في أنظمة الذكاء الاصطناعي.',
    intent: 'learn',
    agentName: 'mentor',
    status: 'pending',
  };

  // سياق فارغ (لا ذاكرة بعد)
  const context: Context = {
    memories: [],
  };

  console.log('=== Mentor Agent Test ===\n');
  console.log('Task:', task.description);
  console.log('---');

  const start = Date.now();
  const result = await mentorAgent.execute(task, context);
  const elapsed = Date.now() - start;

  console.log('\n=== Response ===\n');
  console.log(result.content);
  console.log('\n---');
  console.log(`Time: ${elapsed}ms`);
  console.log(`Artifacts: ${result.artifacts?.length ?? 0}`);
}

main().catch((err) => {
  console.error('❌ TEST FAILED:');
  console.error(err);
  process.exit(1);
});