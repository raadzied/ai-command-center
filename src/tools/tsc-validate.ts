import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { logger as log } from '../llm/logger.js';

export interface TscResult {
  ok: boolean;
  errors: string[];
}
export interface TscOptions {
  tscPath?: string;
}

// يستدعي tsc ويُعيد فقط الأخطاء التي تخص paths المُمرَّرة.
// fail-closed: عند أي شك في فشل tsc نفسه → ok:false.
export function validateTscFiles(
  paths: string[],
  options: TscOptions = {},
): TscResult {
  if (paths.length === 0) return { ok: true, errors: [] };

  const tscPath =
    options.tscPath ??
    resolve(process.cwd(), 'node_modules/typescript/bin/tsc');

  if (!existsSync(tscPath)) {
    log.warn('tsc binary not found', { tscPath });
    return { ok: false, errors: [`tsc binary not found at: ${tscPath}`] };
  }

  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(
      process.execPath,
      [tscPath, '--noEmit'],
      { encoding: 'utf-8', timeout: 60000, shell: false },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('tsc spawn threw', { message: msg });
    return { ok: false, errors: [`tsc could not run: ${msg}`] };
  }

  // فشل spawnSync نفسه
  if (result.error) {
    const msg = result.error.message;
    log.warn('tsc spawn error', { message: msg });
    return { ok: false, errors: [`tsc spawn error: ${msg}`] };
  }

  // قُتل بإشارة
  if (result.status === null) {
    log.warn('tsc killed by signal', { signal: result.signal });
    return { ok: false, errors: [`tsc killed by signal: ${result.signal ?? 'unknown'}`] };
  }

  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const output = stdout + '\n' + stderr;

  // نجاح
  if (result.status === 0) {
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
      status: result.status,
      outputLines: lines.length,
    });
    return {
      ok: false,
      errors: [
        `tsc exited with status ${result.status} but no errors matched checked files (other errors may exist in project)`,
      ],
    };
  }

  log.warn('tsc validation failed', {
    files: paths.length,
    errors: relevant.length,
  });
  return { ok: false, errors: relevant };
}