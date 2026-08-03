import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('probeBinanceAvailability', () => {
    let fetchMock: any;

    beforeEach(() => {
        vi.resetModules();
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    const createResponse = (status: number, ok: boolean, text: string) => ({
        ok,
        status,
        text: vi.fn().mockResolvedValue(text),
    });

    // Fixture 1: 200 -> reachable
    it('1. HTTP 200 -> reachable=true, httpStatus=200, reason=null', async () => {
        fetchMock.mockResolvedValueOnce(createResponse(200, true, '{"serverTime":1785665258473}'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: true,
            httpStatus: 200,
            reason: null,
        });
        expect(typeof result.latencyMs).toBe('number');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
        expect(() => new Date(result.checkedAt).toISOString()).not.toThrow();
        expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
    });

    // Fixture 2: 451 -> geo_block
    it('2. HTTP 451 -> reachable=false, httpStatus=451, reason=geo_block', async () => {
        fetchMock.mockResolvedValueOnce(createResponse(451, false, 'Unavailable For Legal Reasons'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: 451,
            reason: 'geo_block',
        });
    });

    // Fixture 3: 429 -> rate_limited
    it('3. HTTP 429 -> reachable=false, httpStatus=429, reason=rate_limited', async () => {
        fetchMock.mockResolvedValueOnce(createResponse(429, false, '{"code":-1003,"msg":"Too many requests"}'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: 429,
            reason: 'rate_limited',
        });
    });

    // 418 also maps to rate_limited (Binance's IP-ban status after repeated 429s)
    it('3b. HTTP 418 -> reachable=false, httpStatus=418, reason=rate_limited', async () => {
        fetchMock.mockResolvedValueOnce(createResponse(418, false, '{"code":-1003,"msg":"IP banned"}'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: 418,
            reason: 'rate_limited',
        });
    });

    // Fixture 4: network throw -> network_error
    it('4. fetch rejects (network throw) -> reachable=false, httpStatus=null, reason=network_error', async () => {
        fetchMock.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.binance.com'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: null,
            reason: 'network_error',
        });
    });

    it('5. Any other non-2xx (e.g. 500) -> reachable=false, reason=other', async () => {
        fetchMock.mockResolvedValueOnce(createResponse(500, false, 'Internal Server Error'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const result = await probeBinanceAvailability();

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: 500,
            reason: 'other',
        });
    });

    it('6. Real 5s timeout aborts the request via AbortController -> reason=timeout', async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementationOnce((_url: string, opts: any) => {
            return new Promise((_resolve, reject) => {
                opts.signal.addEventListener('abort', () => {
                    const err: any = new Error('The operation was aborted');
                    err.name = 'AbortError';
                    reject(err);
                });
            });
        });
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        const resultPromise = probeBinanceAvailability();
        await vi.advanceTimersByTimeAsync(5000);
        const result = await resultPromise;

        expect(result).toMatchObject({
            exchange: 'binance',
            reachable: false,
            httpStatus: null,
            reason: 'timeout',
        });
    });

    it('7. Never throws to the caller even on total failure', async () => {
        fetchMock.mockRejectedValueOnce(new Error('boom'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        await expect(probeBinanceAvailability()).resolves.not.toThrow();
    });

    it('8. On non-2xx, logs raw upstream status/body and the log line is EXACTLY status+body — nothing else, so no key material (this call takes none, but the function has no way to leak anything beyond what the upstream sent) can appear', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(createResponse(451, false, 'Unavailable For Legal Reasons'));
        const { probeBinanceAvailability } = await import('../exchangeAvailability');

        await probeBinanceAvailability();

        // Exact-match (not substring) is the strongest form of this assertion: it pins the
        // entire log line to status+body, so ANY extra content — secret or otherwise — fails it.
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalledWith(
            '[exchangeAvailability] Binance rejected: status=451 body=Unavailable For Legal Reasons'
        );
        consoleSpy.mockRestore();
    });
});

describe('getBinanceAvailability (60s in-process cache)', () => {
    let fetchMock: any;

    beforeEach(() => {
        vi.resetModules();
        fetchMock = vi.fn();
        global.fetch = fetchMock as any;
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    const createResponse = (status: number, ok: boolean, text: string) => ({
        ok,
        status,
        text: vi.fn().mockResolvedValue(text),
    });

    it('9. Two calls within 60s hit the upstream only once (cache hit)', async () => {
        fetchMock.mockResolvedValue(createResponse(200, true, '{"serverTime":1}'));
        const { getBinanceAvailability } = await import('../exchangeAvailability');

        const first = await getBinanceAvailability();
        const second = await getBinanceAvailability();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
    });

    it('10. A call after 60s elapses re-probes the upstream (cache expiry)', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(createResponse(200, true, '{"serverTime":1}'));
        const { getBinanceAvailability } = await import('../exchangeAvailability');

        await getBinanceAvailability();
        vi.advanceTimersByTime(60_001);
        await getBinanceAvailability();

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('11. A call at exactly 59s still uses the cache', async () => {
        vi.useFakeTimers();
        fetchMock.mockResolvedValue(createResponse(200, true, '{"serverTime":1}'));
        const { getBinanceAvailability } = await import('../exchangeAvailability');

        await getBinanceAvailability();
        vi.advanceTimersByTime(59_000);
        await getBinanceAvailability();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
