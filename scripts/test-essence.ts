import 'dotenv/config';
import { extractEssence } from '../src/voice/essence.js';

const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'رد Mentor مع كود',
    text: `## ما هو HTTP؟

بروتوكول HTTP هو أساس التواصل على الويب. يسمح للمتصفح بطلب صفحات من الخادم.

### مثال:
\`\`\`javascript
fetch('https://example.com')
  .then(r => r.json())
  .then(data => console.log(data));
\`\`\`

الخلاصة: HTTP هو بروتوكول طلب-استجابة.`,
  },
  {
    label: 'رد Coder (كود فقط)',
    text: `سأقوم بكتابة دالة \`sumArray\`.

\`\`\`typescript
function sumArray(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0);
}
\`\`\`

**افتراضات:** المصفوفة أرقام. المصفوفة الفارغة تعود 0.`,
  },
  {
    label: 'رد Designer',
    text: `## نظام التصميم: "ذكريات"

الفلسفة: تصميم هادئ ودافئ يعكس الحنين إلى اللحظات الجميلة.

**الألوان:**
- الأساسي: #6A0572 (بنفسجي دافئ) - يمثل الذكريات
- الثانوي: #F4F4F9 (أبيض مائل) - يوفّر الراحة البصرية

**الخطوط:** Cairo للعناوين، Tajawal للنص.

اقتراحي: استخدم هذا النظام كأساس، وأضف لمساتك الشخصية.`,
  },
  {
    label: 'رسالة خطأ تقنية',
    text: `Error: TS2322: Type 'string' is not assignable to type 'number'.
  at src/utils/foo.ts:42:5
  npm run build failed`,
  },
  {
    label: 'كود سطري قصير + خلاصة',
    text: `سأستخدم \`sum\` للجمع.
    
الخلاصة: الدالة تعمل بشكل صحيح.`,
  },
  {
    label: 'رسالة خطأ فقط',
    text: `Error: TS2322: Type 'string' is not assignable to type 'number'.
  at src/utils/foo.ts:42:5`,
  },
];

function main(): void {
  console.log('=== Essence Extraction Test ===\n');

  for (const s of SAMPLES) {
    console.log(`--- ${s.label} ---`);
    console.log(`Original (${s.text.length} chars)`);
    const essence = extractEssence(s.text);
    if (essence) {
      console.log(`Essence (${essence.length} chars): "${essence}"`);
    } else {
      console.log('Essence: (empty — skipped)');
    }
    console.log('');
  }
}

main();
