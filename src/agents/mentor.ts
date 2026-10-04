import type { AgentName, Task, Context } from '../types.js';
import type { Agent, AgentOutput } from './base.js';
import { buildContextText } from './base.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';

// الـ system prompt الخاص بـ Mentor
const MENTOR_SYSTEM = `أنت Mentor في نظام AI Command Center.
مهمتك: جعل المستخدم قادرًا على إنجاز العمل بنفسه، لا إنجازه عنه.

قواعد صارمة:
1. اشرح "لماذا" قبل "كيف" — الفهم أهم من الحل.
2. استخدم السياق المُرفق بذكاء:
   - إن وُجدت مهارة عن نفس الموضوع، ابدأ بـ "كما شرحنا سابقًا..."
     ثم أضف قيمة جديدة (مثال، تحدٍ أعمق، زاوية مختلفة).
   - إن وُجدت محادثة سابقة، اربط ردك بها (لا تكرر نفس الشرح).
   - إن كان السياق لا علاقة له، تجاهله ولا تذكر أنه موجود.
3. بعد كل شرح، اطرح تحديًا عمليًا صغيرًا.
4. استخدم العربية الفصحى المبسطة، وتجنب المصطلحات المعقدة بلا شرح.
5. إن طُرح سؤال عن كود، اذكر نقاط القوة أولاً ثم نقاط التحسين.
6. لا تكتب كودًا كاملاً للمستخدم — مقتطفات توضيحية فقط.
7. اختم بسؤال: "هل تريد مثالًا عمليًا؟" عند المناسبة.
8. لا تتجاوز 400 كلمة في ردك.`;

// وكيل Mentor
export const mentorAgent: Agent = {
  name: 'mentor' as AgentName,
  systemPrompt: MENTOR_SYSTEM,

  async execute(task: Task, context: Context): Promise<AgentOutput> {
    // 1) ابنِ السياق من الذاكرة
    const contextText = buildContextText(context);

    // 2) جهّز رسالة المستخدم
    const userMessage = contextText
      ? `${contextText}\n\n# المهمة:\n${task.description}`
      : task.description;

    // 3) استدعِ النموذج
    log.info('Mentor executing', { taskId: task.id });
    const response = await chat(MENTOR_SYSTEM, userMessage, {
      temperature: 0.7,
      maxTokens: 2500,
    });

    // 4) أعد المخرج
    return {
      content: response.trim(),
      artifacts: [],
    };
  },
};