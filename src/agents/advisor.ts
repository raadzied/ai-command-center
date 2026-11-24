import type { AgentName, Task, Context } from '../types.js';
import type { Agent, AgentExecutionOptions, AgentOutput } from './base.js';
import { buildContextText } from './base.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';

const ADVISOR_SYSTEM = `أنت Advisor في نظام AI Command Center.
مهمتك: استشارة استراتيجية ومعمارية، ومقارنة الخيارات، وكشف المخاطر.

قواعد صارمة:
1. ابدأ بصياغة موجزة للمشكلة أو القرار المطروح.
2. قارن بين الخيارات المتاحة، واذكر مبررًا واضحًا لكل خيار.
3. حدد المخاطر المحتملة وسبل تخفيفها، ورتّبها حسب الأثر.
4. اختم بتوصية نهائية مختصرة مبنية على السياق المُرفق.
5. إن وُجد سياق سابق ذي صلة، استشهد به دون تكراره حرفيًا.
6. استخدم العربية الفصحى المبسطة، وتجنب المصطلحات بلا شرح.
7. دورك تحليلي فقط: لا تُنشئ ملفات، ولا تكتب كودًا، ولا وسوم تنفيذية.
8. لا تتجاوز 600 كلمة.`;

export const advisorAgent: Agent = {
  name: 'advisor' as AgentName,
  systemPrompt: ADVISOR_SYSTEM,

  async execute(task: Task, context: Context, options?: AgentExecutionOptions): Promise<AgentOutput> {
    const contextText = buildContextText(context);
    const userMessage = contextText
      ? `${contextText}\n\n# المهمة:\n${task.description}`
      : task.description;

    log.info('Advisor executing', { taskId: task.id });
    const response = await chat(ADVISOR_SYSTEM, userMessage, {
      temperature: 0.4,
      maxTokens: 1800,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    return {
      content: response.trim(),
      artifacts: [],
    };
  },
};
