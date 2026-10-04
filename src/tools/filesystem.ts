import { readFile, writeFile, mkdir, readdir, access, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import type { ProposedAction } from '../types.js';
import { executeWithApproval } from './executor.js';
import type { ExecutionResult } from './executor.js';

// PROJECT_ROOT يُحسب بـ realpath مرّة واحدة عند أول استدعاء
let projectRootReal: string | null = null;

async function getProjectRootReal(): Promise<string> {
  projectRootReal ??= await realpath(process.cwd());
  return projectRootReal;
}

// يتحقق أن المسار داخل المشروع (منع traversal و symlink escape)
async function assertInsideProject(target: string): Promise<string> {
  const root = await getProjectRootReal();
  const resolved = resolve(root, target);
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Path outside project: ${target}`);

  // إن كان الملف موجودًا، نتحقق من realpath (لكشف symlinks)
  try {
    const real = await realpath(resolved);
    const realRel = relative(root, real);
    if (realRel.startsWith('..') || isAbsolute(realRel)) throw new Error(`Symlink escape detected: ${target}`);
    return real;
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return resolved; // ملف جديد — لا يزال داخل المشروع
    }
    throw err;
  }
}

// يقرأ ملفًا (safe — موافقة تلقائية)
export async function readProjectFile(
  relativePath: string,
): Promise<ExecutionResult<string>> {
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'قراءة ملف للمشروع',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath);
    return await readFile(fullPath, 'utf-8');
  });
}

// يكتب ملفًا (قد يحتاج موافقة)
export async function writeProjectFile(
  relativePath: string,
  content: string,
): Promise<ExecutionResult<void>> {
  const fullPath = await assertInsideProject(relativePath);
  // false تعني: غير موجود (أو غير مقروء — الكتابة ستفشل لاحقًا مسجَّلة)
  const exists = await access(fullPath).then(() => true, () => false);

  const action: ProposedAction = {
    type: 'file_write',
    target: relativePath,
    reason: `كتابة ${content.length} حرفًا${exists ? ' (فوق ملف موجود)' : ''}`,
    overwrite: exists,
  };

  return executeWithApproval(action, async () => {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
  });
}

// يتحقق من وجود ملف
export async function projectFileExists(
  relativePath: string,
): Promise<ExecutionResult<boolean>> {
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'التحقق من الوجود',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath);
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
  });
}

// يسرد مجلدًا
export async function listProjectDirectory(
  relativePath: string,
): Promise<ExecutionResult<string[]>> {
  const action: ProposedAction = {
    type: 'file_read',
    target: relativePath,
    reason: 'سرد مجلد',
  };

  return executeWithApproval(action, async () => {
    const fullPath = await assertInsideProject(relativePath);
    return await readdir(fullPath);
  });
}
