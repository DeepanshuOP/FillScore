// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Design v5 step 0 (2026-11-23): this public, uncached diagnostic must not send traffic to api.binance.com on every visit.
 * Binance lists GET /api/v3/time on data-api.binance.vision
 * (https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, read 2026-11-23).
 */
describe('GET /api/preflight', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('probes Binance on data-api.binance.vision, never api.binance.com', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { urls.push(u); return new Response('{}', { status: 200 }); }));
    const { GET } = await import('./route');
    const body = await (await GET()).json();
    expect(urls).toContain('https://data-api.binance.vision/api/v3/time');
    expect(urls.some((u) => u.includes('api.binance.com'))).toBe(false);
    expect(body.exchanges.find((e: { exchange: string }) => e.exchange === 'binance')).toMatchObject({ httpStatus: 200, ok: true });
  });
});
