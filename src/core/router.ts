import type { Task, Intent, AgentName } from '../types.js';
import type { Agent } from '../agents/base.js';
import { getAgent } from '../agents/registry.js';

// خريطة النية → اسم الوكيل
const INTENT_TO_AGENT: Record<Exclude<Intent, 'chat'>, AgentName> = {
  learn: 'mentor',
  build: 'coder',
  design: 'designer',
};

// يعيّن اسم الوكيل من النية
export function intentToAgentName(intent: Intent): AgentName {
  if (intent === 'chat') return 'mentor';
  return INTENT_TO_AGENT[intent];
}

// يختار الوكيل من الـ Registry بناءً على المهمة
export function selectAgent(task: Task): Agent | null {
  if (task.intent === 'chat') return null;
  return getAgent(task.agentName);
}

// يعيد قائمة الوكلاء المسجلين
export function listAgents(): AgentName[] {
  return ['mentor', 'coder', 'designer'];
}
