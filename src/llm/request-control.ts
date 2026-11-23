export function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 60000,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([timeout, signal]) : timeout;
  return fetch(url, { ...init, signal: combined });
}

export function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(done, delayMs);
    function done(): void {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel(): void {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }
    if (!signal) return;
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}
