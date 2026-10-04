import type { AgentName, Task, Context } from '../types.js';
import type { Agent, AgentOutput } from './base.js';
import { buildContextText } from './base.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';

const DESIGNER_SYSTEM = `أنت Designer في نظام AI Command Center.
مهمتك: بناء أنظمة تصميم، لا شاشات متفرقة.

قواعد صارمة:
1. ابدأ بوصف نظام التصميم (الألوان، الخطوط، المسافات).
2. كل قرار تصميمي يحتاج مبررًا ("اخترت X لأن Y").
3. اقترح بنية هرمية للصفحة (Header، Main، Footer...).
4. رعََََََََََََََََََََََََََََََََََََََََََ� إمكانية الوصول (تباين الألوان، أحجام الخطوط).
5. أدعم RTL إن كان السياق عربيًا.
6. إن طُلب تصميم متعدد الشاشات، اذكر التسلسل.
7. لا تتجاوز 500 كلمة.`;

// وكيل Designer
export const designerAgent: Agent = {
  name: 'designer' as AgentName,
  systemPrompt: DESIGNER_SYSTEM,

  async execute(task: Task, context: Context): Promise<AgentOutput> {
    const contextText = buildContextText(context);

    const userMessage = contextText
      ? `${contextText}\n\n# المهمة:\n${task.description}`
      : task.description;

    log.info('Designer executing', { taskId: task.id });

    const response = await chat(DESIGNER_SYSTEM, userMessage, {
      temperature: 0.6,
      maxTokens: 3000,
    });

    return {
      content: response.trim(),
      artifacts: [],
    };
  },
};