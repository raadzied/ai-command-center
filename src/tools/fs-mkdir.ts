// Safe directory creation for [[MKDIR:relative/path]] agent markers.

import { mkdir } from 'node:fs/promises';
import type { ProposedAction, RunScope } from '../types.js';
import { executeWithApproval } from './executor.js';
import type { ExecutionResult } from './executor.js';
import { DAILY_DISABLED, assertInsideProject, resolveScopeRoot } from './filesystem.js';
import { RunCancelledError, throwIfAborted } from '../core/run-control.js';

const MKDIR_PATTERN = /\[\[MKDIR:\s*([^\]\n]+?)\s*\]\]/g;
const MAX_DIRS = 10;
const PROTECTED_SEGMENTS = new Set(['.git', 'node_modules']);

/** .git / node_modules / .env* are never created, at any depth. */
function isProtectedPath(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment: string): boolean => {
    const lower = segment.toLowerCase();
    return PROTECTED_SEGMENTS.has(lower) || lower === '.env' || lower.startsWith('.env.');
  });
}

/** Extracts every [[MKDIR:...]] path in order (bounds are enforced later). */
export function extractMkdirInstructions(text: string): string[] {
  MKDIR_PATTERN.lastIndex = 0;
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = MKDIR_PATTERN.exec(text)) !== null) {
    const raw = match[1];
    if (raw === undefined) continue;
    const path = raw.trim();
    if (path.length > 0) paths.push(path);
  }
  return paths;
}

function stripMkdirMarkers(text: string): string {
  MKDIR_PATTERN.lastIndex = 0;
  return text.replace(MKDIR_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Creates one project-relative directory behind the approval gate. */
export async function createProjectDir(
  relativePath: string,
  scope?: RunScope,
  signal?: AbortSignal,
): Promise<ExecutionResult<void>> {
  if (scope !== undefined && scope.kind !== 'workspace') throw new Error(DAILY_DISABLED);
  if (scope?.kind === 'workspace' && scope.workspaceRoot.trim() === '') {
    throw new Error(DAILY_DISABLED);
  }
  if (isProtectedPath(relativePath)) {
    throw new Error(`مسار محمي — لا يمكن إنشاء مجلد: ${relativePath}`);
  }
  const root = await resolveScopeRoot(scope);
  const fullPath = await assertInsideProject(relativePath, root);
  const action: ProposedAction = {
    type: 'file_write',
    target: relativePath,
    reason: `إنشاء مجلد ${relativePath}`,
  };
  return executeWithApproval(action, async (): Promise<void> => {
    await mkdir(fullPath, { recursive: true });
  }, scope, signal);
}

export interface MkdirMarkerResult {
  cleanedContent: string;
  createdDirs: string[];
  statusText: string;
  rejectedCount: number;
  total: number;
}

/** Executes up to ten MKDIR markers before any WRITE_FILE marker runs. */
export async function processMkdirMarkers(
  text: string,
  scope?: RunScope,
  signal?: AbortSignal,
): Promise<MkdirMarkerResult> {
  const paths = extractMkdirInstructions(text);
  if (paths.length === 0) {
    return { cleanedContent: text, createdDirs: [], statusText: '', rejectedCount: 0, total: 0 };
  }
  const cleanedContent = stripMkdirMarkers(text);
  if (paths.length > MAX_DIRS) {
    return {
      cleanedContent,
      createdDirs: [],
      statusText: `\n\n[DIR] عدد وسوم MKDIR تجاوز الحد (${paths.length} > ${MAX_DIRS}). لم يُنشأ أي مجلد.`,
      rejectedCount: paths.length,
      total: paths.length,
    };
  }

  const createdDirs: string[] = [];
  const lines: string[] = [];
  let rejectedCount = 0;
  for (const relativePath of paths) {
    throwIfAborted(signal);
    try {
      const result = await createProjectDir(relativePath, scope, signal);
      if (result.executed) {
        createdDirs.push(relativePath);
        lines.push(`[OK] ${relativePath}`);
      } else {
        rejectedCount += 1;
        lines.push(`[REJECT] ${relativePath}: ${result.error ?? 'مرفوض'}`);
      }
    } catch (err) {
      if (err instanceof RunCancelledError) throw err;
      rejectedCount += 1;
      const message = err instanceof Error ? err.message : String(err);
      lines.push(`[REJECT] ${relativePath}: ${message}`);
    }
  }
  const statusText = `\n\n[DIR] المجلدات (${createdDirs.length}/${paths.length}):\n${lines.join('\n')}`;
  return { cleanedContent, createdDirs, statusText, rejectedCount, total: paths.length };
}
