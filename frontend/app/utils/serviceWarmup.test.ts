import { describe, it, expect, vi } from 'vitest';
import { waitForHealthy } from './serviceWarmup';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}
const ok = { ok: true } as Response;
const bad = { ok: false } as Response;

describe('waitForHealthy', () => {
  it('returns true straight away when the service is up', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok);
    const onSlow = vi.fn();
    const res = await waitForHealthy('http://x/health', { fetchFn, onSlow, ...clock() });
    expect(res).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('retries a sleeping service until it answers', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(ok);
    const res = await waitForHealthy('http://x/health', { fetchFn, retryDelayMs: 3000, ...clock() });
    expect(res).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('reports slowness once, after the threshold', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(bad).mockResolvedValueOnce(bad).mockResolvedValueOnce(bad).mockResolvedValueOnce(ok);
    const onSlow = vi.fn();
    await waitForHealthy('http://x/health', { fetchFn, onSlow, retryDelayMs: 3000, slowAfterMs: 4000, ...clock() });
    expect(onSlow).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout and returns false', async () => {
    const fetchFn = vi.fn().mockResolvedValue(bad);
    const res = await waitForHealthy('http://x/health', { fetchFn, retryDelayMs: 3000, timeoutMs: 9000, ...clock() });
    expect(res).toBe(false);
    // attempts at t = 0, 3000, 6000, 9000, then the deadline has passed
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });
});
