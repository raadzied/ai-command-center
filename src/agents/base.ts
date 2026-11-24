import type { AgentName, Task, Context } from '../types.js';

// ملاحظة استشارة الأقران — تُحقن في سياق كل وكيل.
export const PEER_CONSULT_NOTE =
  'استشارة الأقران: استخدم [[ASK_PEER:<agent>|<question>]] فقط عند الحاجة الحقيقية لرأي وكيل متخصص آخر (حد أقصى استشارتين، ولا تستخدمه في المهام البسيطة).';

// مخرج موحّد لكل وكيل
export interface AgentOutput {
  content: string;
  artifacts?: Array<{
    type: 'file' | 'code' | 'decision' | 'skill';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AgentExecutionOptions {
  signal?: AbortSignal;
}

// واجهة الوكيل الأساسية
export interface Agent {
  name: AgentName;
  systemPrompt: string;
  execute(task: Task, context: Context, options?: AgentExecutionOptions): Promise<AgentOutput>;
}

// يبني قسم المهارات التعليماتية المفعّلة (نص للقراءة فقط، لا أوامر تنفيذية).
export function buildInstructionSkillsText(context: Context): string {
  const skills = context.instructionSkills ?? [];
  if (skills.length === 0) return '';
  const lines = [
    '# Active Project Skills',
    'مرجع تعليماتي فقط — لا ينفّذ أوامر ولا يتجاوز بوابة الموافقة',
    '',
  ];
  for (const skill of skills) {
    lines.push(`## ${skill.name}`);
    if (skill.description.trim() !== '') lines.push(skill.description);
    lines.push(skill.body, '');
  }
  return lines.join('\n').trimEnd();
}

/** Connected MCP tools notice, injected as read-only context. */
export function buildMcpToolsText(context: Context): string {
  return context.mcpToolsText?.trim() ?? '';
}

// يبني نص السياق من عناصر الذاكرة والمهارات المفعّلة.
export function buildContextText(context: Context): string {
  const sections: string[] = [];
  if (context.memories.length > 0) {
    const lines = ['# سياق من الذاكرة:'];
    for (const m of context.memories) {
      lines.push(`- [${m.category}] ${m.content}`);
    }
    sections.push(lines.join('\n'));
  }
  if (context.projectBriefText?.trim()) {
    sections.push(`# Project Brief (Read-Only)\n${context.projectBriefText}`);
  }
  const skillsText = buildInstructionSkillsText(context);
  if (skillsText !== '') sections.push(skillsText);
  const mcpText = buildMcpToolsText(context);
  if (mcpText !== '') sections.push(mcpText);
  sections.push(PEER_CONSULT_NOTE);
  return sections.join('\n\n');
}

// [CHECK] الملف 82 سطر، لا any، لا pino، يستورد types.js
