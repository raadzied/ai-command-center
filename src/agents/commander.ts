import type { AgentName, Task, Context } from '../types.js';
import type { Agent, AgentExecutionOptions, AgentOutput } from './base.js';
import { buildContextText } from './base.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';

const COMMANDER_SYSTEM = `أنت Commander في نظام AI Command Center.
مهمتك: تحويل الأهداف إلى خطط عمل نصية مرتّبة بأولويات واضحة.

قواعد صارمة:
1. ابدأ بجملة واحدة توضّح الهدف النهائي كما فهمته.
2. قسّم العمل إلى خطوات مرقّمة، لكل خطوة مخرَج متوقّع.
3. رتّب الخطوات بأولوية التنفيذ (P1 ثم P2 ثم P3)، وبيّن التبعيات.
4. اذكر نقطة تحقّق قصيرة بعد كل خطوة.
5. إن وُجد سياق سابق ذي صلة، اربط الخطة به دون تكراره.
6. استخدم العربية الفصحى المبسطة، وبقيت الخطة نصية فقط.
7. لا تُنشئ ملفات، ولا تكتب كودًا، ولا وسوم تنفيذية — أنت تخطّط لا تُنفّذ.
8. لا تتجاوز 700 كلمة.`;

export const commanderAgent: Agent = {
  name: 'commander' as AgentName,
  systemPrompt: COMMANDER_SYSTEM,

  async execute(task: Task, context: Context, options?: AgentExecutionOptions): Promise<AgentOutput> {
    const contextText = buildContextText(context);
    const userMessage = contextText
      ? `${contextText}\n\n# المهمة:\n${task.description}`
      : task.description;

    log.info('Commander executing', { taskId: task.id });
    const response = await chat(COMMANDER_SYSTEM, userMessage, {
      temperature: 0.3,
      maxTokens: 2000,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    return {
      content: response.trim(),
      artifacts: [],
    };
  },
};
