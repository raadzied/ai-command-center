import { logger as log } from '../llm/logger.js';

// أنماط يفهمها المطوّر — تُحذف من النطق
const TECHNICAL_PATTERNS: RegExp[] = [
  // أكواد مسوّرة (code blocks) — تُحذف كاملة
  /```[\s\S]*?```/g,

  // أكواد سطرية — تُحذف
  /`[^`]+`/g,

  // أوامر shell (سطر كامل يبدأ بـ $ أو npm أو git...)
  /^[\s]*\$[\s]+.+$/gm,
  /^[\s]*(npm|npx|pnpm|yarn|git|cd|mkdir|rmdir|rm|del|mv|cp|copy|chmod)\s+.*$/gm,

  // روابط URL
  /https?:\/\/\S+/g,
  /www\.\S+/g,

  // مسارات ملفات (src/foo/bar.ts، E:\path، C:\path)
  /(?:[A-Za-z]:)?[\\\/](?:[\w.-]+[\\\/])+[\w.-]+/g,

  // ألوان hex (#RRGGBB، #RGB)
  /#[0-9A-Fa-f]{3,8}\b/g,

  // JSON بسيط { "key": value }
  /\{[^{}]{5,}\}/g,

  // رسائل الأخطاء التقنية
  /\bError\s*:\s*TS\d+.*?(?=[.؟!؛…]|$)/g,
  /\bTS\d{3,5}\b.*?(?=[.؟!؛…]|$)/g,
  /\bat\s+[\w./\\-]+:\d+:\d+/g,
  /\b(stack|trace|Error|Exception)\b.*?(?=[.؟!؛…]|$)/gi,

  // خطوط أفقية Markdown
  /^[-=_]{3,}$/gm,

  // علامات تقنية منفصلة
  /[{}<>]/g,
];

// علامات Markdown
const MARKDOWN_PATTERNS: RegExp[] = [
  /^#{1,6}\s+(.*)$/gm,
  /\*\*([^*]+)\*\*/g,
  /\*([^*]+)\*/g,
  /__([^_]+)__/g,
  /_([^_]+)_/g,
  /^[\s]*[-*+]\s+(.*)$/gm,
  /^[\s]*\d+\.\s+(.*)$/gm,
  /^>\s+(.*)$/gm,
  /\[([^\]]+)\]\([^)]+\)/g,
];

// أنماط المجاملات التي تُتخطى عند اختيار الجوهر
const GREETING_PATTERNS: RegExp[] = [
  /^(أهلاً|أهلا|مرحباً|مرحبا|السلام عليكم|تحياتي|يسرني|يسعدني|بكل سرور|بالتأكيد|بالطبع)/u,
  /^كما (ناقشنا|شرحنا|تحدثنا|ذكرنا)/u,
  /^(Welcome|Hi|Hello|Glad|Happy|Sure|Of course)/i,
  /^(في البداية|للبدء|دعنا نبدأ|لنبدأ)/u,
];

// عتبة الأحرف الدنيا للجوهر المستخرج
export const DEFAULT_MIN_CHARS = 4;

function isGreeting(sentence: string): boolean {
  const trimmed = sentence.trim();
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

// يزيل التفاصيل التقنية ثم Markdown
function cleanText(text: string): string {
  let result = text;

  for (const pattern of TECHNICAL_PATTERNS) {
    result = result.replace(pattern, ' ');
  }
  for (const pattern of MARKDOWN_PATTERNS) {
    result = result.replace(pattern, '$1');
  }

  // مسافات متعددة → مسافة واحدة
  result = result.replace(/\s+/g, ' ').trim();

  // إزالة المسافة قبل علامات الترقيم
  result = result.replace(/\s+([.،؛:!؟؟])/g, '$1');
  return result;
}

// يقسّم النص إلى جمل
function splitSentences(text: string): string[] {
  // علامات نهاية الجملة العربية والإنجليزية
  const parts = text
    .split(/(?<=[.؟!؛…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts;
}

// يتحقق إن كانت الجملة ذات معنى للنطق
function isMeaningful(sentence: string): boolean {
  // جملة قصيرة جدًا → ربما مجرد رمز
  if (sentence.length < 10) return false;
  // جملة تحتوي على نمط تقني → ليست جوهرًا
  const TECH_NOISE = /\b(TS\d+|Error|Exception|stack|trace|undefined|null|NaN)\b/i;
  if (TECH_NOISE.test(sentence)) return false;
  // جملة معظمها رموز → تجاهل
  const letters = sentence.replace(/[^\p{L}\p{N}\s]/gu, '').length;
  if (letters / sentence.length < 0.5) return false;
  return true;
}

export interface EssenceOptions {
  maxSentences?: number;
  maxChars?: number;
  minChars?: number;
}

// الواجهة الرئيسية: يستخرج جوهر الرد للنطق
export function extractEssence(
  text: string,
  options: EssenceOptions = {},
): string {
  const maxSentences = options.maxSentences ?? 2;
  const maxChars = options.maxChars ?? 300;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;

  // 1) تنظيف
  const cleaned = cleanText(text);
  if (!cleaned) {
    log.info('Essence: empty after cleaning');
    return '';
  }

  // 2) جمل ذات معنى
  const meaningful = splitSentences(cleaned).filter(isMeaningful);
  if (meaningful.length === 0) {
    log.info('Essence: no meaningful sentences');
    return '';
  }

  // 3) تصفية الجمل الترحيبية — نحتفظ بالجمل غير الترحيبية فقط
  const nonGreeting = meaningful.filter((s) => !isGreeting(s));
  // إذا كانت المصفوفة مصفوفة فارغة (كل شيء ترحيب)، لا نفقد الجمل الأصلية، نحتفظ بها
  const sentences = nonGreeting.length > 0 ? nonGreeting : meaningful.slice(0, maxSentences);

  // 4) أول N جملة
  let essence = sentences.slice(0, maxSentences).join(' ');

  // 5) حد أقصى للأحرف — عند آخر مسافة
  if (essence.length > maxChars) {
    const cut = essence.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    essence =
      lastSpace > maxChars * 0.6
        ? cut.slice(0, lastSpace) + '…'
        : cut + '…';
  }

  // 6) قصير جدًا → تجاهل، لكن احتفظ برد افتراضي إذا كان النص الأصلي موجوداً
  if (essence.length < minChars) {
    log.info('Essence: too short', { length: essence.length });
    if (!text.trim()) return '';
    if (text.includes('```')) {
      return 'تم إعداد الكود البرمجي المطلوب بنجاح.';
    }
    return cleaned.slice(0, 200);
  }

  log.info('Essence extracted', {
    original: text.length,
    cleaned: cleaned.length,
    sentences: sentences.length,
    final: essence.length,
  });

  return essence;
}
