import type { RunScope } from '../types.js';

// سجل واحد داخل لوحة خاصة بتشغيل محدد — بلا حالة عالمية.
export interface BoardEntry {
  readonly author: string;
  readonly key: string;
  readonly value: string;
  readonly at: number;
}

export interface SharedBoard {
  readonly runId: string;
  readonly scope: RunScope;
  post(author: string, key: string, value: string): void;
  get(key: string): string | null;
  list(): readonly BoardEntry[];
  snapshotText(maxChars?: number): string;
  dispose(): void;
  isDisposed(): boolean;
}

// ينشئ لوحة خاصة بتشغيل واحد؛ كل نسخة مستقلة تماماً عن غيرها.
export function createSharedBoard(scope: RunScope, runId: string): SharedBoard {
  const entries: BoardEntry[] = [];
  let disposed = false;

  const ensureOpen = (): void => {
    if (disposed) throw new Error('SharedBoard is disposed');
  };

  return {
    runId,
    scope,

    post(author: string, key: string, value: string): void {
      ensureOpen();
      if (key.trim().length === 0) throw new Error('SharedBoard key must not be empty');
      entries.push({ author, key, value, at: Date.now() });
    },

    get(key: string): string | null {
      ensureOpen();
      const found = entries.find((entry): boolean => entry.key === key);
      return found ? found.value : null;
    },

    list(): readonly BoardEntry[] {
      ensureOpen();
      return entries.slice();
    },

    snapshotText(maxChars = 2000): string {
      ensureOpen();
      const text = entries
        .map((entry): string => `[${entry.key}] ${entry.author}: ${entry.value}`)
        .join('\n');
      if (text.length <= maxChars) return text;
      if (maxChars <= 3) return text.slice(0, Math.max(0, maxChars));
      return `${text.slice(0, maxChars - 3)}...`;
    },

    dispose(): void {
      disposed = true;
    },

    isDisposed(): boolean {
      return disposed;
    },
  };
}
