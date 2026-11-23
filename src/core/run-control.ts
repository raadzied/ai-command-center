/** Shared lifecycle states for one cancellable assistant run. */
export type RunPhase =
  | 'IDLE'
  | 'PLANNING'
  | 'THINKING'
  | 'AWAITING_APPROVAL'
  | 'APPLYING_CHANGES'
  | 'VALIDATING'
  | 'DONE'
  | 'CANCELLED'
  | 'ERROR';

export type RunPhaseListener = (phase: RunPhase, detail?: string) => void;

export class RunCancelledError extends Error {
  public constructor() {
    super('Run cancelled by user');
    this.name = 'RunCancelledError';
  }
}

export interface RunController {
  readonly signal: AbortSignal;
  setPhase(phase: RunPhase, detail?: string): void;
  cancel(): void;
  isCancelled(): boolean;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RunCancelledError();
}

export function createRunController(onPhase?: RunPhaseListener): RunController {
  const controller = new AbortController();
  let phase: RunPhase = 'IDLE';

  const setPhase = (next: RunPhase, detail?: string): void => {
    phase = next;
    onPhase?.(phase, detail);
  };

  return {
    get signal(): AbortSignal {
      return controller.signal;
    },
    setPhase,
    cancel(): void {
      if (controller.signal.aborted) return;
      controller.abort();
      setPhase('CANCELLED');
    },
    isCancelled(): boolean {
      return controller.signal.aborted || phase === 'CANCELLED';
    },
  };
}
