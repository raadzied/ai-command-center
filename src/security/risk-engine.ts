import type {
  ProposedAction,
  ClassifiedAction,
  RiskLevel,
  ActionType,
} from '../types.js';

// كلمات مفتاحية خطرة في terminal commands
const DANGEROUS_TERMINAL_PATTERNS = [
  /\brm\s+-rf\b/,
  /\brm\s+-r\b/,
  /\bdel\s+\/[sq]\b/i,
  /\bformat\b/i,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /shutdown/,
  /reboot/,
  /:\(\)\{.*\};:/, // fork bomb
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+reset\s+--hard/i,
  /\bRemove-Item\s+.*-Recurse/i,
];

// أوامر آمنة مؤكدة (كل ما ليس هنا = review)
const SAFE_TERMINAL_COMMANDS = [
  /^(ls|dir|pwd|cd|echo|cat|type|head|tail|wc|which|where|whoami)\b/i,
  /^git\s+(status|log|diff|branch|show|remote)\b/i,
  /^(node|python|python3)\s+--version\b/i,
  /^(npm|pnpm|yarn)\s+(list|ls|outdated|why)\b/i,
  /^Get-(ChildItem|Content|Location|Process|Date|Command)\b/i,
  /^Test-Path\b/i,
];

// (^|[\\/]) يسمح بالبداية أو بشرطة مائلة قبل النمط،
// ليغطي كلاً من المسارات المطلقة والنسبية المباشرة.
const PROTECTED_PATHS = [
  /(^|[\\/])\.git[\\/]/i,
  /(^|[\\/])node_modules[\\/]/i,
  /(^|[\\/])\.env($|\.)/i,
  /(^|[\\/])package-lock\.json$/i,
];

// كود المصدر نفسه — الكتابة فيه تستحق مراجعة دائمة.
// السبب: مخرجات الوكلاء قد تكون مولّدة وغير مطابقة للأنواع، وإدخالها
// في src/ يكسر بناء المشروع (tsc) دون مراجعة بشرية.
const SOURCE_CODE_PATTERNS = [
  /(^|[\\/])src[\\/]/i,
];

// ملفات "critical" — تعديلها يستحق مراجعة
const CRITICAL_FILE_PATTERNS = [
  /package\.json$/i,
  /tsconfig\.json$/i,
  /\.env\.example$/i,
];

// ─── المصنف الرئيسي ───

export function classifyAction(
  action: ProposedAction,
): ClassifiedAction {
  const { risk, explanation } = classify(action);
  return { ...action, risk, explanation };
}

function classify(
  action: ProposedAction,
): { risk: RiskLevel; explanation: string } {
  // مسارات محمية — أبدًا
  if (hasProtectedPath(action.target)) {
    return {
      risk: 'dangerous',
      explanation: 'المسار محمي — التعديل ممنوع',
    };
  }

  switch (action.type) {
    case 'file_read':
      return { risk: 'safe', explanation: 'قراءة ملف — بلا خطر' };

    case 'file_write':
      return classifyWrite(action);

    case 'file_delete':
      return { risk: 'review', explanation: 'حذف ملف — يحتاج موافقة' };

    case 'terminal':
      return classifyTerminal(action);

    case 'http_request':
      return { risk: 'review', explanation: 'طلب شبكة — يحتاج موافقة' };

    case 'git_operation':
      return { risk: 'review', explanation: 'عملية git — تحتاج موافقة' };
  }
}

function classifyWrite(
  action: ProposedAction,
): { risk: RiskLevel; explanation: string } {
  if (hasCriticalFile(action.target)) {
    return {
      risk: 'review',
      explanation: 'تعديل ملف حرج',
    };
  }
  if (hasSourceCodePath(action.target)) {
    return {
      risk: 'review',
      explanation: 'كتابة داخل src/ — تحتاج مراجعة بشرية',
    };
  }
  if (action.overwrite === true) {
    return {
      risk: 'review',
      explanation: 'الكتابة فوق ملف موجود',
    };
  }
  return { risk: 'safe', explanation: 'كتابة ملف جديد — بلا خطر' };
}

function classifyTerminal(
  action: ProposedAction,
): { risk: RiskLevel; explanation: string } {
  const cmd = action.target.trim();

  // 1) خطير مؤكد → dangerous (أعلى أولوية)
  for (const pattern of DANGEROUS_TERMINAL_PATTERNS) {
    if (pattern.test(cmd)) {
      return { risk: 'dangerous', explanation: 'أمر خطر — محجوب' };
    }
  }

  // 2) آمن مؤكد → safe
  for (const pattern of SAFE_TERMINAL_COMMANDS) {
    if (pattern.test(cmd)) {
      return { risk: 'safe', explanation: 'أمر آمن' };
    }
  }

  // 3) افتراضي → review (لا safe تلقائي)
  return { risk: 'review', explanation: 'أمر غير مُدرج في القائمة الآمنة' };
}

function hasProtectedPath(target: string): boolean {
  return PROTECTED_PATHS.some((p) => p.test(target));
}

function hasCriticalFile(target: string): boolean {
  return CRITICAL_FILE_PATTERNS.some((p) => p.test(target));
}

function hasSourceCodePath(target: string): boolean {
  return SOURCE_CODE_PATTERNS.some((p) => p.test(target));
}

// للاستخدام في الاختبارات
export function listProtectedPaths(): RegExp[] {
  return [...PROTECTED_PATHS];
}

export function listDangerousCommands(): RegExp[] {
  return [...DANGEROUS_TERMINAL_PATTERNS];
}
