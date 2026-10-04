import type { Task, Context, Intent } from '../types.js';
import { classify } from '../llm/classifier.cloud.js';
import { intentToAgentName } from './router.js';
import { decompose, toTasks } from './decomposer.js';
import { logger as log } from '../llm/logger.js';

export interface Plan {
  intent: Intent;
  isChat: boolean;
  tasks: Task[];
}

// يبني خطة من نص المستخدم
export async function createPlan(
  input: string,
  _context: Context,
): Promise<Plan> {
  const classification = await classify(input);

  log.info('Plan created', {
    intent: classification.intent,
    confidence: classification.confidence,
  });

  if (classification.intent === 'chat') {
    return { intent: 'chat', isChat: true, tasks: [] };
  }

  // حاول التفكيك إلى مهام
  const decomposed = await decompose(input);

  let tasks: Task[];
  if (decomposed.length > 0) {
    tasks = toTasks(decomposed);
  } else {
    // fallback: مهمة واحدة (كما في V1.5)
    // مهام البناء تتطلب تحققًا حقيقيًا من المراجع
    tasks = [
      {
        id: generateTaskId(),
        description: input,
        intent: classification.intent,
        agentName: intentToAgentName(classification.intent),
        status: 'pending',
        verificationRequired: classification.intent === 'build',
        dependsOn: [],
      },
    ];
    log.info('Falling back to single-task plan');
  }

  return {
    intent: classification.intent,
    isChat: false,
    tasks,
  };
}

// يلخّص الخطة للعرض
export function describePlan(plan: Plan): string {
  if (plan.isChat) return 'دردشة عادية — لا وكيل مطلوب';
  if (plan.tasks.length === 0) return `نية: ${plan.intent} → بلا مهام`;
  const first = plan.tasks[0];
  if (plan.tasks.length === 1 && first) {
    return `نية: ${plan.intent} → وكيل: ${first.agentName}`;
  }
  if (plan.tasks.length === 1) return `نية: ${plan.intent} → بلا مهمة صالحة`;
  const names = plan.tasks.map((t) => t.agentName).join(' → ');
  return `خطة متعددة (${plan.tasks.length} مهام): ${names}`;
}

// معرّف فريد للمهمة
function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
