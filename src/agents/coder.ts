import type { AgentName, Task, Context } from '../types.js';
import type { Agent, AgentOutput } from './base.js';
import { buildContextText } from './base.js';
import { chat } from '../llm/chat.js';
import { logger as log } from '../llm/logger.js';

const CODER_SYSTEM = `أنت Coder في نظام AI Command Center.
مهمتك: كتابة كود نظيف، مختبر، وقابل للصيانة.

قواعد صارمة:
1. قبل الكتابة، اذرَح بما ستفعله (سطر أو سطران).
2. اكتب الكود كاملاً في كتلة code block مع اسم اللغة.
3. بعد الكود، اذكر أي افتراضات أو متطلبات.
4. إن كان الكود يحتاج اختبارات، أضف اختبارًا بسيطًا.
5. تجنب المكتبات غير الضرورية. استخدم ما هو مثبت في المشروع.
6. إن لم تكن متأكدًا من شيء، اسأل بدلاً من التخمين.
7. لا تتجاوز 600 كلمة.

قواعد استخدام markers:

عندما يطلب المستخدم إنشاء ملف أو تعديله، أنهِ ردك بـ:

[WRITE_FILE: relative/path/to/file.ext]
<محتوى الملف كاملاً هنا>
[/WRITE_FILE]

قواعد صارمة:
1. استخدم marker الكتابة فقط عندما يطلب المستخدم صراحة
   "اكتب ملفًا" أو "أنشئ ملفًا" أو "عدّل الملف".
2. لا تستخدم marker الكتابة لأمثلة الكود التوضيحية.
3. المسار نسبي لجذر المشروع (لا مطلق، لا ..).
4. محتوى الملف كامل — لا placeholders.
5. يمكنك استخدام حتى 5 markers في رد واحد لإنشاء ملفات
   متعددة مرتبطة (مثل: مكون + ملف اختباره).
6. markers إضافية بعد الحد الأقصى (5) سيؤدي إلى رفض كل
   الملفات — لا تتجاوز الحد.
7. لا تُضف شرحًا بعد marker الكتابة.
قاعدة صارمة لمحتوى marker الكتابة:
- داخل [WRITE_FILE: ...] و [/WRITE_FILE] ضع الكود **خاماً**
  دون أي أسوار markdown (لا \`\`\`typescript، لا \`\`\`javascript).
- لا تكتب أي شرح داخل marker الكتابة — فقط محتوى الملف
  نفسه.
- الشرح والأمثلة التوضيحية الأخرى تبقى خارج marker.
`;

// وكيل Coder
export const coderAgent: Agent = {
  name: 'coder' as AgentName,
  systemPrompt: CODER_SYSTEM,

  async execute(task: Task, context: Context): Promise<AgentOutput> {
    const contextText = buildContextText(context);

    const userMessage = contextText
      ? `${contextText}\n\n# المهمة:\n${task.description}`
      : task.description;

    log.info('Coder executing', { taskId: task.id });

    const response = await chat(CODER_SYSTEM, userMessage, {
      temperature: 0.3,
      maxTokens: 5000,
    });

    return {
      content: response.trim(),
      artifacts: [],
    };
  },
};