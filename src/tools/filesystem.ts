import { readFile, writeFile, mkdir, readdir, access, realpath, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, sep } from 'node:path';
import type { ProposedAction, RunScope } from '../types.js';
import { executeWithApproval } from './executor.js';
import type { ExecutionResult } from './executor.js';
import type { RunPhaseListener } from '../core/run-control.js';
import { logger as log } from '../llm/logger.js';
import { buildUnifiedDiff, sha256Text } from './diff.js';

// رسالة رفض الوضع اليومي — مشتركة مع markers.ts
export const DAILY_DISABLED =
  'أدوات الملفات معطّلة في الوضع اليومي — افتح مشروعاً أولاً.';

// PROJECT_ROOT يُحسب بـ realpath مرّة واحدة عند أول استدعاء (CLI بدون scope)
let projectRootReal: string | null = null;

async function getProjectRootReal(): Promise<string> {
  projectRootReal ??= await realpath(process.cwd());
  return projectRootReal;
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** جذر النطاق: daily → رفض فوري، workspace → مجلد المشروع، CLI → process.cwd(). */
export async function resolveScopeRoot(scope?: RunScope): Promise<string> {
  if (scope?.kind === 'daily') {
    throw new Error(DAILY_DISABLED);
  }
  if (scope?.kind === 'workspace' && scope.workspaceRoot.trim() !== '') {
    return await realpath(scope.workspaceRoot);
  }
  // CLI (بدون scope) أو workspace بلا جذر محدّد — الجذر الافتراضي process.cwd()
  return await getProjectRootReal();
}

/** rel === '..' أو '../…' أو مسار مطلق → خارج الجذر (يسمح بمجلد مثل '..config'). */
function isOutsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);
}

/** أعمق مسار موجود فعلياً على القرص — لفحص realPath قبل إنشاء ملف جديد. */
function deepestExistingAncestor(target: string): string {
  let current = target;
  for (;;) {
    if (existsSync(current)) return current;
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

// يتحقق أن المسار داخل المشروع (منع traversal و symlink escape)
export async function assertInsideProject(target: string, root: string): Promise<string> {
  const resolved = resolve(root, target);
  if (isOutsideRoot(root, resolved)) {
    throw new Error(`Path outside project: ${target}`);
  }

  try {
    const real = await realpath(resolved);
    if (isOutsideRoot(root, real)) {
      throw new Error(`Symlink escape detected: ${target}`);
    }
    return real;
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      // ملف جديد — اصعد إلى أعمق أب موجود وافحص realPathه قبل السماح بالإنشاء
      const ancestor = deepestExistingAncestor(resolved);
      const realAncestor = await realpath(ancestor);
      if (isOutsideRoot(root, realAncestor)) {
        throw new Error(`Symlink escape detected: ${target}`);
      }
      return resolved;
    }
    throw err;
  }
}

// يقرأ ملفًا (safe — موافقة تلقائية)
export async function readProjectFile(
  relativePath: string,
  scope?: RunScope,
): Promise<ExecutionResult<string>> {
  const root = await resolveScopeRoot(scope);
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'قراءة ملف للمشروع',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath, root);
    return await readFile(fullPath, 'utf-8');
  }, scope);
}

// يكتب ملفًا (قد يحتاج موافقة). `reason` اختياري في الذيل للحفاظ على توافق المستدعيات.
export async function writeProjectFile(
  relativePath: string,
  content: string,
  scope?: RunScope,
  signal?: AbortSignal,
  onPhase?: RunPhaseListener,
  reason?: string,
): Promise<ExecutionResult<void>> {
  const root = await resolveScopeRoot(scope);
  const fullPath = await assertInsideProject(relativePath, root);
  const before = await readExisting(fullPath);
  const exists = before !== null;
  const preview = buildUnifiedDiff(relativePath, before, content);

  const action: ProposedAction = {
    type: 'file_write',
    target: relativePath,
    reason: reason ?? `كتابة ${content.length} حرفًا${exists ? ' (فوق ملف موجود)' : ''}`,
    overwrite: exists,
    preview,
  };

  return executeWithApproval(action, async (): Promise<void> => {
    // فحص البصمة بعد الموافقة: أي تعديل يدوي أثناء الانتظار يُلغي الكتابة.
    const current = await readExisting(fullPath);
    const currentHash = current === null ? null : sha256Text(current);
    if (currentHash !== preview.beforeHash) {
      throw new Error('تغيّر الملف على القرص أثناء انتظار الموافقة — أُلغيت الكتابة لحماية تعديلاتك اليدوية.');
    }
    await mkdir(dirname(fullPath), { recursive: true });
    const tmpPath = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
    try {
      await writeFile(tmpPath, content, 'utf8');
      await rename(tmpPath, fullPath);
    } catch (err) {
      try {
        await unlink(tmpPath);
      } catch (cleanupErr) {
        log.warn('Temp file cleanup failed', {
          tmpPath, message: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
        });
      }
      throw err;
    }
  }, scope, signal, onPhase);
}

// يتحقق من وجود ملف
export async function projectFileExists(
  relativePath: string,
  scope?: RunScope,
): Promise<ExecutionResult<boolean>> {
  const root = await resolveScopeRoot(scope);
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'التحقق من الوجود',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath, root);
    try {
      await access(fullPath);
      return true;
    } catch (err) {
      // ENOENT = الملف غير موجود → false صحيح
      // أي خطأ آخر (صلاحيات، I/O) → نُعيد الرمي (No Silent Fallback)
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return false;
      }
      throw err;
    }
  }, scope);
}

// يسرد مجلدًا
export async function listProjectDirectory(
  relativePath: string,
  scope?: RunScope,
): Promise<ExecutionResult<string[]>> {
  const root = await resolveScopeRoot(scope);
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'سرد مجلد',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath, root);
    return await readdir(fullPath);
  }, scope);
}
