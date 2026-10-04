import type { Agent } from './base.js';
import type { AgentName } from '../types.js';
import { mentorAgent } from './mentor.js';
import { coderAgent } from './coder.js';
import { designerAgent } from './designer.js';

// وصف موحّد لكل وكيل — يُستخدم للتوجيه والتحقق
export interface AgentMeta {
  agent: Agent;
  capabilities: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

// السجل الديناميكي للوكلاء
const registry = new Map<AgentName, AgentMeta>();

// يُسجّل وكيلًا — يمكن استدعاؤه من أي مكان عند إضافة وكيل جديد
export function registerAgent(name: AgentName, meta: AgentMeta): void {
  if (registry.has(name)) {
    throw new Error(`Agent already registered: ${name}`);
  }
  registry.set(name, meta);
}

// يعيد وكيلًا بالاسم أو null
export function getAgent(name: AgentName): Agent | null {
  const meta = registry.get(name);
  return meta ? meta.agent : null;
}

// يعيد بيانات وصفية للوكيل
export function getAgentMeta(name: AgentName): AgentMeta | null {
  return registry.get(name) ?? null;
}

// يعيد قائمة كل أسماء الوكلاء المسجلين
export function listRegisteredAgents(): AgentName[] {
  return Array.from(registry.keys());
}

// ─────────────────────────────────────────────────────
// التسجيل الأولي — الوكلاء الثلاثة الحاليون
// ─────────────────────────────────────────────────────

registerAgent('mentor', {
  agent: mentorAgent,
  capabilities: ['teaching', 'explaining', 'challenging'],
  riskLevel: 'low',
});

registerAgent('coder', {
  agent: coderAgent,
  capabilities: ['code_generation', 'debugging', 'testing'],
  riskLevel: 'medium',
});

registerAgent('designer', {
  agent: designerAgent,
  capabilities: ['design_system', 'ui_layout', 'accessibility', 'rtl'],
  riskLevel: 'low',
});
