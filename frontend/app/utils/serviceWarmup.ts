export interface WarmupOptions {
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  retryDelayMs?: number;
  slowAfterMs?: number;
  onSlow?: () => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Polls a service's health URL until it answers, for hosts that put free services
 * to sleep and take about a minute to wake them. Calls onSlow once if it takes
 * longer than slowAfterMs so the UI can say what is happening. Returns false if
 * the service never answers within timeoutMs.
 */
export async function waitForHealthy(url: string, opts: WarmupOptions = {}): Promise<boolean> {
  const {
    fetchFn = (u, init) => fetch(u, init),
    timeoutMs = 90_000,
    retryDelayMs = 3_000,
    slowAfterMs = 4_000,
    onSlow,
    now = () => Date.now(),
    sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts;

  const start = now();
  let slowReported = false;

  for (;;) {
    try {
      const res = await fetchFn(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // service still asleep or unreachable; retry below
    }
    const elapsed = now() - start;
    if (!slowReported && elapsed >= slowAfterMs) {
      slowReported = true;
      onSlow?.();
    }
    if (elapsed >= timeoutMs) return false;
    await sleep(retryDelayMs);
    if (now() - start > timeoutMs) return false;
  }
}
