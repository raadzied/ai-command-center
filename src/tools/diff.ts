// Dependency-free unified diff preview for approval dialogs.

import { createHash } from 'node:crypto';

export interface FileDiffPreview {
  readonly isNew: boolean;
  readonly diff: string;
  readonly added: number;
  readonly removed: number;
  readonly beforeHash: string | null;
}

type DiffKind = 'ctx' | 'add' | 'del';
interface DiffLine { readonly kind: DiffKind; readonly text: string; }

/** Stable SHA-256 of a text payload — used for the hash recheck after approval. */
export function sha256Text(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function splitLines(text: string): string[] {
  // A trailing newline terminates the last line; it must not create an empty one.
  const trimmed = text.replace(/(?:\r?\n)+$/, '');
  return trimmed === '' ? [] : trimmed.split(/\r?\n/);
}

function prefixSuffixDiff(before: string[], after: string[]): DiffLine[] {
  const ops: DiffLine[] = [];
  const n = before.length;
  const m = after.length;
  let start = 0;
  while (start < n && start < m && before[start] === after[start]) start += 1;
  let end = 0;
  while (end < n - start && end < m - start &&
         before[n - 1 - end] === after[m - 1 - end]) end += 1;
  for (let i = 0; i < start; i += 1) ops.push({ kind: 'ctx', text: before[i] ?? '' });
  for (let i = start; i < n - end; i += 1) ops.push({ kind: 'del', text: before[i] ?? '' });
  for (let i = start; i < m - end; i += 1) ops.push({ kind: 'add', text: after[i] ?? '' });
  for (let i = 0; i < end; i += 1) ops.push({ kind: 'ctx', text: before[n - 1 - i] ?? '' });
  return ops;
}

/** LCS line diff with a cheap fallback for very large files. */
function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  if (n * m > 250_000) return prefixSuffixDiff(before, after);
  const dp: number[][] = Array.from(
    { length: n + 1 }, (): number[] => new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i];
    if (row === undefined) continue;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = before[i] === after[j]
        ? (dp[i + 1]?.[j + 1] ?? 0) + 1
        : Math.max(dp[i + 1]?.[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  const ops: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: 'ctx', text: before[i] ?? '' }); i += 1; j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      ops.push({ kind: 'del', text: before[i] ?? '' }); i += 1;
    } else {
      ops.push({ kind: 'add', text: after[j] ?? '' }); j += 1;
    }
  }
  while (i < n) { ops.push({ kind: 'del', text: before[i] ?? '' }); i += 1; }
  while (j < m) { ops.push({ kind: 'add', text: after[j] ?? '' }); j += 1; }
  return ops;
}

function render(ops: DiffLine[], maxLines: number): string {
  const prefix: Record<DiffKind, string> = { ctx: '  ', add: '+ ', del: '- ' };
  const all = ops.map((op: DiffLine): string => `${prefix[op.kind]}${op.text}`);
  const shown = all.slice(0, maxLines);
  if (all.length > maxLines) shown.push('... (truncated)');
  return shown.join('\n');
}

/** Builds a bounded unified-diff preview for the approval dialog. */
export function buildUnifiedDiff(
  relativePath: string,
  before: string | null,
  after: string,
  maxLines = 120,
): FileDiffPreview {
  if (before === null) {
    const lines = splitLines(after);
    const body = render(lines.map((text: string): DiffLine => ({ kind: 'add', text })), maxLines);
    return {
      isNew: true, diff: `--- /dev/null\n+++ b/${relativePath}\n${body}`,
      added: lines.length, removed: 0, beforeHash: null,
    };
  }
  const ops = diffLines(splitLines(before), splitLines(after));
  const added = ops.filter((op) => op.kind === 'add').length;
  const removed = ops.filter((op) => op.kind === 'del').length;
  const body = render(ops, maxLines);
  return {
    isNew: false, diff: `--- a/${relativePath}\n+++ b/${relativePath}\n${body}`,
    added, removed, beforeHash: sha256Text(before),
  };
}
