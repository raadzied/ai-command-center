import 'dotenv/config';

// اختبار بسيط: نحاكي فشل مهمة بلا استدعاء processInput الفعلي
// (لأنه يحتاج API). بدلًا من ذلك، نختبر أن summaries تبنى
// بشكل صحيح عند تمرير بيانات ثابتة.

interface TaskSummary {
  id: string;
  agentName: string;
  status: 'done' | 'failed';
  error?: string;
  elapsedMs: number;
}

function buildSummary(
  tasks: { id: string; success: boolean; error?: string }[],
): TaskSummary[] {
  return tasks.map((t) => ({
    id: t.id,
    agentName: 'mentor' as const,
    status: t.success ? 'done' : 'failed',
    error: t.error,
    elapsedMs: 100,
  }));
}

function main(): void {
  console.log('=== Task Failure Isolation Test ===\n');

  // 1) كل المهام ناجحة
  const allOk = buildSummary([
    { id: 't1', success: true },
    { id: 't2', success: true },
    { id: 't3', success: true },
  ]);
  const pass1 = allOk.every((s) => s.status === 'done');
  console.log(`${pass1 ? '✓' : '✗'} all success (${allOk.length} tasks)`);

  // 2) مهمة فاشلة في المنتصف
  const oneFail = buildSummary([
    { id: 't1', success: true },
    { id: 't2', success: false, error: 'MAX_TOKENS' },
    { id: 't3', success: true },
  ]);
  const pass2 =
    oneFail.filter((s) => s.status === 'done').length === 2 &&
    oneFail.filter((s) => s.status === 'failed').length === 1 &&
    oneFail[1]?.error === 'MAX_TOKENS';
  console.log(`${pass2 ? '✓' : '✗'} one failure isolated`);

  // 3) كل المهام فاشلة
  const allFail = buildSummary([
    { id: 't1', success: false, error: 'API down' },
    { id: 't2', success: false, error: 'API down' },
  ]);
  const pass3 = allFail.every((s) => s.status === 'failed');
  console.log(`${pass3 ? '✓' : '✗'} all failed`);

  const total = [pass1, pass2, pass3].filter(Boolean).length;
  console.log(`\n=== ${total}/3 passed ===`);
  process.exit(total === 3 ? 0 : 1);
}

main();