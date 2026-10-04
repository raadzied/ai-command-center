// وصف أداة — يُستخدم لاحقًا لربطها بالوكلاء وبوابة الموافقة
export interface ToolMeta {
  name: string;
  description: string;
  // مستوى الخطر: يحدد إن كانت تحتاج موافقة المستخدم قبل التنفيذ
  riskLevel: 'read_only' | 'writes' | 'executes';
  // الأدوات التي يسمح لها باستخدام هذه الأداة
  allowedAgents: string[];
}

// السجل الديناميكي للأدوات
const tools = new Map<string, ToolMeta>();

export function registerTool(meta: ToolMeta): void {
  if (tools.has(meta.name)) {
    throw new Error(`Tool already registered: ${meta.name}`);
  }
  tools.set(meta.name, meta);
}

export function getTool(name: string): ToolMeta | null {
  return tools.get(name) ?? null;
}

export function listRegisteredTools(): ToolMeta[] {
  return Array.from(tools.values());
}

// يعيد الأدوات المسموح بها لوكيل معيّن
export function getToolsForAgent(agentName: string): ToolMeta[] {
  return Array.from(tools.values()).filter((t) =>
    t.allowedAgents.includes(agentName),
  );
}

// ─────────────────────────────────────────────
// تسجيل الأدوات الأولية (Filesystem)
// ─────────────────────────────────────────────

registerTool({
  name: 'filesystem.read',
  description: 'قراءة ملف من داخل المشروع',
  riskLevel: 'read_only',
  allowedAgents: ['mentor', 'coder', 'designer'],
});

registerTool({
  name: 'filesystem.write',
  description: 'كتابة ملف داخل المشروع',
  riskLevel: 'writes',
  allowedAgents: ['coder'],
});

registerTool({
  name: 'filesystem.list',
  description: 'سرد محتويات مجلد',
  riskLevel: 'read_only',
  allowedAgents: ['mentor', 'coder', 'designer'],
});

registerTool({
  name: 'filesystem.exists',
  description: 'التحقق من وجود ملف',
  riskLevel: 'read_only',
  allowedAgents: ['mentor', 'coder', 'designer'],
});
