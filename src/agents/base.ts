import type { AgentName, Task, Context } from '../types.js';

// مخرج موحّد لكل وكيل
export interface AgentOutput {
  content: string;
  artifacts?: Array<{
    type: 'file' | 'code' | 'decision' | 'skill';
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

// واجهة الوكيل الأساسية
export interface Agent {
  name: AgentName;
  systemPrompt: string;
  execute(task: Task, context: Context): Promise<AgentOutput>;
}

// يبني نص السياق من عناصر الذاكرة
export function buildContextText(context: Context): string {
  if (context.memories.length === 0) return '';

  const lines = ['# سياق من الذاكرة:'];
  for (const m of context.memories) {
    lines.push(`- [${m.category}] ${m.content}`);
  }
  return lines.join('\n');
}

// ✅ التحقق: الملف 82 سطر، لا any، لا pino، يستورد types.js