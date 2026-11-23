import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logger as log } from '../llm/logger.js';

export interface TscResult {
  ok: boolean;
  errors: string[];
  /** true = تم التخطّي (مشروع بلا tsconfig أو بلا typescript) — لا فشل. */
  skipped?: boolean;
}
export interface TscOptions {
  tscPath?: string;
  /** جذر مجلد المشروع — الافتراضي process.cwd() لنداءات CLI القديمة. */
  workspaceRoot?: string;
}

/** مهلة التشغيل بالمللي ثانية — يُقتل بعدها حتى لا تتجمد نوافذ Electron. */
const TSC_TIMEOUT_MS = 20_000;

/** ناتج عملية spawn واحدة. */
interface TscOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
  timedOut: boolean;
}

// يستدعي tsc بشكل غير متزامن (spawn + Promise) ويُعيد أخطاء ملفاتنا فقط.
// fail-closed: عند أي شك في فشل tsc نفسه → ok:false.
export async function validateTscFiles(
  paths: string[],
  options: TscOptions = {},
): Promise<TscResult> {
  if (paths.length === 0) return { ok: true, errors: [] };

  const root = options.workspaceRoot ?? process.cwd();
  const tsconfigPath = join(root, 'tsconfig.json');
  const projectTscPath = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
  const tscPath = options.tscPath ?? projectTscPath;

  // مشروع بلا TypeScript (Python/HTML…): تخطٍّ صريح بلا فشل وبلا فحص مجلد APEX
  if (!existsSync(tsconfigPath) || !existsSync(projectTscPath)) {
    log.info('tsc validation skipped — no tsconfig.json or typescript here', {
      root,
    });
    return { ok: true, skipped: true, errors: [] };
  }

  let child: ChildProcess;
  try {
    child = spawn(process.execPath, [tscPath, '--noEmit'], {
      cwd: root,
      shell: false,
      windowsHide: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('tsc spawn threw', { message: msg });
    return { ok: false, errors: [`tsc could not run: ${msg}`] };
  }

  const outcome = await new Promise<TscOutcome>((resolveOutcome) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TSC_TIMEOUT_MS);

    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string): void => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string): void => {
      stderr += chunk;
    });
    child.on('error', (err: NodeJS.ErrnoException): void => {
      clearTimeout(timer);
      resolveOutcome({ code: null, stdout, stderr, error: err.message, timedOut });
    });
    child.on('close', (code: number | null): void => {
      clearTimeout(timer);
      resolveOutcome({ code, stdout, stderr, error: null, timedOut });
    });
  });

  // فشل spawn نفسه (ENOENT …)
  if (outcome.error !== null) {
    log.warn('tsc spawn error', { message: outcome.error });
    return { ok: false, errors: [`tsc spawn error: ${outcome.error}`] };
  }

  // انتهت المهلة وقُتل
  if (outcome.timedOut) {
    log.warn('tsc timed out', { timeoutMs: TSC_TIMEOUT_MS });
    return { ok: false, errors: [`tsc timed out after ${TSC_TIMEOUT_MS}ms`] };
  }

  const output = outcome.stdout + '\n' + outcome.stderr;

  // نجاح
  if (outcome.code === 0) {
    log.info('tsc validation passed', { files: paths.length });
    return { ok: true, errors: [] };
  }

  // فشل — فلترة الأخطاء
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const normalizedPaths = paths.map((p) => p.replace(/\\/g, '/'));
  const relevant = lines.filter((rawLine) => {
    const line = rawLine.replace(/\\/g, '/');
    return normalizedPaths.some((p) => line.startsWith(p + '('));
  });

  // فشل tsc لكن لا أخطاء مطابقة لملفاتنا → fail-closed
  if (relevant.length === 0) {
    log.warn('tsc failed with no matching errors', {
      status: outcome.code,
      outputLines: lines.length,
    });
    return {
      ok: false,
      errors: [
        `tsc exited with status ${outcome.code} but no errors matched checked files (other errors may exist in project)`,
      ],
    };
  }

  log.warn('tsc validation failed', {
    files: paths.length,
    errors: relevant.length,
  });
  return { ok: false, errors: relevant };
}
