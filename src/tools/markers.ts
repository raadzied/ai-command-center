import type { ExecutionResult } from './executor.js';
import { writeProjectFile } from './filesystem.js';
import { logger as log } from '../llm/logger.js';

// الحد الأقصى لعدد markers في رد واحد
const MAX_MARKERS = 5;

// نمط marker الكتابة
const WRITE_PATTERN =
  /\[WRITE_FILE:\s*([^\]\n]+?)\s*\]\s*\n([\s\S]*?)\n\s*\[\/WRITE_FILE\]/g;

// تعليمة كتابة مستخرجة من رد وكيل
export interface WriteInstruction {
  path: string;
  content: string;
}

// نتيجة معالجة markers
export interface MarkerResult {
  cleanedContent: string;
  writeStatus: string;
  wroteCount: number;
  rejectedCount: number;
  totalMarkers: number;
}

// يستخرج كل تعليمات الكتابة من النص
export function extractWriteInstructions(
  text: string,
): WriteInstruction[] {
  const instructions: WriteInstruction[] = [];
  // نُعيد تهيئة lastIndex لتفادي مشاكل global regex
  WRITE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = WRITE_PATTERN.exec(text)) !== null) {
    const rawPath = match[1];
    const rawContent = match[2];
    if (!rawPath || rawContent === undefined) continue;

    const path = rawPath.trim();
    if (!path) continue;

    instructions.push({ path, content: rawContent });
  }

  return instructions;
}

// للتوافق مع STEP 31 — يستخرج marker واحد
export function extractWriteInstruction(
  text: string,
): WriteInstruction | null {
  const all = extractWriteInstructions(text);
  return all[0] ?? null;
}

// يزيل كل markers الكتابة من النص
function stripWriteMarkers(text: string): string {
  WRITE_PATTERN.lastIndex = 0;
  return text.replace(WRITE_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ينفذ كل أوامر الكتابة
export async function processMarkers(
  text: string,
): Promise<MarkerResult> {
  const instructions = extractWriteInstructions(text);

  if (instructions.length === 0) {
    return {
      cleanedContent: text,
      writeStatus: '',
      wroteCount: 0,
      rejectedCount: 0,
      totalMarkers: 0,
    };
  }

  if (instructions.length > MAX_MARKERS) {
    log.warn('Too many markers', { count: instructions.length });
    return {
      cleanedContent: stripWriteMarkers(text),
      writeStatus: `\n\n❌ عدد markers تجاوز الحد (${instructions.length} > ${MAX_MARKERS}). لم يُحفظ أي ملف.`,
      wroteCount: 0,
      rejectedCount: instructions.length,
      totalMarkers: instructions.length,
    };
  }

  log.info('Processing markers', { count: instructions.length });

  let wroteCount = 0;
  let rejectedCount = 0;
  const statusLines: string[] = [];

  for (const instruction of instructions) {
    log.info('Marker detected', { path: instruction.path });

    let result: ExecutionResult<void>;
    try {
      result = await writeProjectFile(instruction.path, instruction.content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Marker execution threw', {
        message,
        path: instruction.path,
      });
      statusLines.push(`❌ ${instruction.path}: ${message}`);
      rejectedCount++;
      continue;
    }

    if (result.executed) {
      statusLines.push(`✅ ${instruction.path}`);
      wroteCount++;
    } else {
      statusLines.push(
        `❌ ${instruction.path}: ${result.error ?? 'مرفوض'}`,
      );
      rejectedCount++;
    }
  }

  const cleaned = stripWriteMarkers(text);
  const summary = `\n\n📁 نتائج الكتابة (${wroteCount}/${instructions.length}):\n${statusLines.join('\n')}`;

  return {
    cleanedContent: cleaned,
    writeStatus: summary,
    wroteCount,
    rejectedCount,
    totalMarkers: instructions.length,
  };
}

// للاختبارات
export function countWriteMarkers(text: string): number {
  const matches = text.match(/\[WRITE_FILE:/g);
  return matches ? matches.length : 0;
}
