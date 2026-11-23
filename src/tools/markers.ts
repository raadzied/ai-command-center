import type { ExecutionResult } from './executor.js';
import type { RunScope } from '../types.js';
import { DAILY_DISABLED, writeProjectFile } from './filesystem.js';
import { processMkdirMarkers } from './fs-mkdir.js';
import { logger as log } from '../llm/logger.js';
import { RunCancelledError, throwIfAborted } from '../core/run-control.js';
import type { RunPhaseListener } from '../core/run-control.js';

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
  wrotePaths: string[];
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

// ينفذ كل أوامر الكتابة (scope؟ اختياري — CLI بلا scope يعمل كما كان)
export async function processMarkers(
  text: string,
  scope?: RunScope,
  signal?: AbortSignal,
  onPhase?: RunPhaseListener,
): Promise<MarkerResult> {
  throwIfAborted(signal);
  // المجلدات أولاً — ثم الكتابة داخلها.
  const dirs = await processMkdirMarkers(text, scope, signal);
  const source = dirs.cleanedContent;
  const instructions = extractWriteInstructions(source);

  if (instructions.length === 0) {
    return {
      cleanedContent: source,
      writeStatus: dirs.statusText,
      wroteCount: 0,
      rejectedCount: dirs.rejectedCount,
      totalMarkers: 0,
      wrotePaths: [],
    };
  }

  // الوضع اليومي: منع أي كتابة على القرص وإرجاع رسالة واضحة للمستخدم
  if (scope?.kind === 'daily') {
    log.warn('Markers blocked in daily mode', { count: instructions.length });
    return {
      cleanedContent: stripWriteMarkers(source),
      writeStatus: `${dirs.statusText}\n\n[BLOCKED] ${DAILY_DISABLED} لم يُحفظ أي ملف.`,
      wroteCount: 0,
      rejectedCount: instructions.length + dirs.rejectedCount,
      totalMarkers: instructions.length,
      wrotePaths: [],
    };
  }

  if (instructions.length > MAX_MARKERS) {
    log.warn('Too many markers', { count: instructions.length });
    return {
      cleanedContent: stripWriteMarkers(source),
      writeStatus: `${dirs.statusText}\n\n[FAIL] عدد markers تجاوز الحد (${instructions.length} > ${MAX_MARKERS}). لم يُحفظ أي ملف.`,
      wroteCount: 0,
      rejectedCount: instructions.length + dirs.rejectedCount,
      totalMarkers: instructions.length,
      wrotePaths: [],
    };
  }

  log.info('Processing markers', { count: instructions.length });

  let wroteCount = 0;
  let rejectedCount = dirs.rejectedCount;
  const wrotePaths: string[] = [];
  const statusLines: string[] = [];

  for (const instruction of instructions) {
    throwIfAborted(signal);
    log.info('Marker detected', { path: instruction.path });

    // لا قائمة مسموحات صلبة — الحدود الحقيقية:
    // assertInsideProject + risk-engine + بوابة الموافقة
    let result: ExecutionResult<void>;
    try {
      result = await writeProjectFile(instruction.path, instruction.content, scope, signal, onPhase);
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      log.warn('Marker execution threw', {
        message,
        path: instruction.path,
      });
      statusLines.push(`[REJECT] ${instruction.path}: ${message}`);
      rejectedCount++;
      continue;
    }

    if (result.executed) {
      statusLines.push(`[OK] ${instruction.path}`);
      wroteCount++;
      wrotePaths.push(instruction.path);
    } else {
      statusLines.push(
        `[REJECT] ${instruction.path}: ${result.error ?? 'مرفوض'}`,
      );
      rejectedCount++;
    }
  }

  const cleaned = stripWriteMarkers(source);
  const summary =
    `${dirs.statusText}\n\n[FILES] نتائج الكتابة (${wroteCount}/${instructions.length}):\n${statusLines.join('\n')}`;

  return {
    cleanedContent: cleaned,
    writeStatus: summary,
    wroteCount,
    rejectedCount,
    totalMarkers: instructions.length,
    wrotePaths,
  };
}

// للاختبارات
export function countWriteMarkers(text: string): number {
  const matches = text.match(/\[WRITE_FILE:/g);
  return matches ? matches.length : 0;
}
