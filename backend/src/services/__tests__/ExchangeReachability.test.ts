import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
    const mockGet = vi.fn();
    return {
        default: { get: mockGet },
        get: mockGet,
    };
});

import { probeAllExchanges } from '../ExchangeReachability';

const mockedGet = axios.get as any;

const okResponse = (status = 200) => ({ status, data: {} });

describe('probeAllExchanges', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Fixture 1: 200 from Binance -> reachable
    it('1. 200 from Binance -> { exchange: binance, status: reachable, httpStatus: 200 }', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockResolvedValueOnce(okResponse(200)) // bybit
            .mockResolvedValueOnce(okResponse(200)); // okx

        const results = await probeAllExchanges();
        const binance = results.find(r => r.exchange === 'binance');

        expect(binance).toMatchObject({ exchange: 'binance', status: 'reachable', httpStatus: 200 });
        expect(mockedGet.mock.calls[0][0]).toBe('https://api.binance.com/api/v3/time');
        expect(mockedGet.mock.calls[1][0]).toBe('https://api.bybit.com/v5/market/time');
        expect(mockedGet.mock.calls[2][0]).toBe('https://www.okx.com/api/v5/public/time');
    });

    // Fixture 2: 451 from Binance -> geo_blocked
    it('2. 451 from Binance -> { exchange: binance, status: geo_blocked, httpStatus: 451 }', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(451)) // binance
            .mockResolvedValueOnce(okResponse(200)) // bybit
            .mockResolvedValueOnce(okResponse(200)); // okx

        const results = await probeAllExchanges();
        const binance = results.find(r => r.exchange === 'binance');

        expect(binance).toMatchObject({ exchange: 'binance', status: 'geo_blocked', httpStatus: 451 });
    });

    // Fixture 3: 429 from Bybit -> rate_limited
    it('3. 429 from Bybit -> status rate_limited, httpStatus 429', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockResolvedValueOnce(okResponse(429)) // bybit
            .mockResolvedValueOnce(okResponse(200)); // okx

        const results = await probeAllExchanges();
        const bybit = results.find(r => r.exchange === 'bybit');

        expect(bybit).toMatchObject({ exchange: 'bybit', status: 'rate_limited', httpStatus: 429 });
    });

    // Fixture 4: thrown network error from OKX -> unreachable
    it('4. thrown network error from OKX -> status unreachable, httpStatus null', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockResolvedValueOnce(okResponse(200)) // bybit
            .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND www.okx.com')); // okx

        const results = await probeAllExchanges();
        const okx = results.find(r => r.exchange === 'okx');

        expect(okx).toMatchObject({ exchange: 'okx', status: 'unreachable', httpStatus: null });
    });

    // Fixture 5: a timeout longer than the 5000ms budget -> unreachable
    it('5. a hang past the 5000ms budget -> status unreachable, httpStatus null', async () => {
        vi.useFakeTimers();
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockImplementationOnce(() => new Promise(() => { /* never resolves */ })) // bybit
            .mockResolvedValueOnce(okResponse(200)); // okx

        const resultPromise = probeAllExchanges();
        await vi.advanceTimersByTimeAsync(5000);
        const results = await resultPromise;
        const bybit = results.find(r => r.exchange === 'bybit');

        expect(bybit).toMatchObject({ exchange: 'bybit', status: 'unreachable', httpStatus: null });
    });

    // Fixture 6: one exchange failing does not prevent the other two from returning results
    it('6. one exchange failing does not short-circuit the other two', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockRejectedValueOnce(new Error('boom')) // bybit
            .mockResolvedValueOnce(okResponse(200)) // okx
            .mockResolvedValueOnce(okResponse(200)) // binance-data
            .mockResolvedValueOnce(okResponse(200)); // bybit-alt

        const results = await probeAllExchanges();

        expect(results).toHaveLength(5);
        expect(results.map(r => r.exchange).sort()).toEqual(
            ['binance', 'binance-data', 'bybit', 'bybit-alt', 'okx'].sort()
        );
        expect(results.find(r => r.exchange === 'binance')?.status).toBe('reachable');
        expect(results.find(r => r.exchange === 'bybit')?.status).toBe('unreachable');
        expect(results.find(r => r.exchange === 'okx')?.status).toBe('reachable');
    });

    // Fixture 7: exact key shape
    it('7. every result has exactly: exchange, status, httpStatus, latencyMs, checkedAt, detail', async () => {
        mockedGet.mockResolvedValue(okResponse(200));

        const results = await probeAllExchanges();

        const expectedKeys = ['checkedAt', 'detail', 'exchange', 'httpStatus', 'latencyMs', 'status'].sort();
        for (const result of results) {
            expect(Object.keys(result).sort()).toEqual(expectedKeys);
        }
    });

    // Fixture 8: never leaks a header, key, or signature (generic over all results,
    // so this already covers the 2 new alternate-domain targets below)
    it('8. no probe result ever contains a header, key, or signature', async () => {
        mockedGet.mockResolvedValue(okResponse(200));

        const results = await probeAllExchanges();
        const serialized = JSON.stringify(results);

        expect(serialized.toLowerCase()).not.toContain('header');
        expect(serialized.toLowerCase()).not.toContain('apikey');
        expect(serialized.toLowerCase()).not.toContain('api_key');
        expect(serialized.toLowerCase()).not.toContain('signature');
        expect(serialized.toLowerCase()).not.toContain('x-mbx');
    });

    // Fixture 12: all five targets are probed, in parallel, and one failing does not affect the others
    it('12. all five targets are probed in parallel; one failing does not affect the others', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockResolvedValueOnce(okResponse(200)) // bybit
            .mockResolvedValueOnce(okResponse(200)) // okx
            .mockRejectedValueOnce(new Error('boom')) // binance-data
            .mockResolvedValueOnce(okResponse(200)); // bybit-alt

        const results = await probeAllExchanges();

        expect(results).toHaveLength(5);
        expect(results.find(r => r.exchange === 'binance')?.status).toBe('reachable');
        expect(results.find(r => r.exchange === 'bybit')?.status).toBe('reachable');
        expect(results.find(r => r.exchange === 'okx')?.status).toBe('reachable');
        expect(results.find(r => r.exchange === 'binance-data')?.status).toBe('unreachable');
        expect(results.find(r => r.exchange === 'bybit-alt')?.status).toBe('reachable');
    });

    // Fixture 13: 451 from binance-data classifies as geo_blocked via the same classification map
    it('13. 451 from binance-data -> status geo_blocked, httpStatus 451', async () => {
        mockedGet
            .mockResolvedValueOnce(okResponse(200)) // binance
            .mockResolvedValueOnce(okResponse(200)) // bybit
            .mockResolvedValueOnce(okResponse(200)) // okx
            .mockResolvedValueOnce(okResponse(451)) // binance-data
            .mockResolvedValueOnce(okResponse(200)); // bybit-alt

        const results = await probeAllExchanges();
        const binanceData = results.find(r => r.exchange === 'binance-data');

        expect(binanceData).toMatchObject({ exchange: 'binance-data', status: 'geo_blocked', httpStatus: 451 });
    });

    // Fixture 14: 200 from bybit-alt classifies as reachable
    it('14. 200 from bybit-alt -> status reachable, httpStatus 200', async () => {
        mockedGet.mockResolvedValue(okResponse(200));

        const results = await probeAllExchanges();
        const bybitAlt = results.find(r => r.exchange === 'bybit-alt');

        expect(bybitAlt).toMatchObject({ exchange: 'bybit-alt', status: 'reachable', httpStatus: 200 });
    });

    // Fixture 15: exact result count and exact exchange labels
    it('15. response array has exactly 5 entries with the exact exchange labels', async () => {
        mockedGet.mockResolvedValue(okResponse(200));

        const results = await probeAllExchanges();

        expect(results).toHaveLength(5);
        expect(results.map(r => r.exchange).sort()).toEqual(
            ['binance', 'binance-data', 'bybit', 'bybit-alt', 'okx'].sort()
        );
    });
});

describe('getExchangeReachability (60s in-process cache)', () => {
    beforeEach(() => {
        vi.resetModules();
        mockedGet.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('9. two calls within 60s hit each exchange only once (cache hit)', async () => {
        mockedGet.mockResolvedValue(okResponse(200));
        const { getExchangeReachability } = await import('../ExchangeReachability');

        const first = await getExchangeReachability();
        const second = await getExchangeReachability();

        expect(mockedGet).toHaveBeenCalledTimes(5); // 5 exchanges, probed once
        expect(second.exchanges).toEqual(first.exchanges);
        expect(second.checkedAt).toBe(first.checkedAt);
        expect(first.cached).toBe(false);
        expect(second.cached).toBe(true);
    });

    it('10. a call after 60s elapses re-probes all three exchanges', async () => {
        vi.useFakeTimers();
        mockedGet.mockResolvedValue(okResponse(200));
        const { getExchangeReachability } = await import('../ExchangeReachability');

        await getExchangeReachability();
        vi.advanceTimersByTime(60_001);
        const second = await getExchangeReachability();

        expect(mockedGet).toHaveBeenCalledTimes(10);
        expect(second.cached).toBe(false);
    });

    it('11. a call at exactly 59s still uses the cache', async () => {
        vi.useFakeTimers();
        mockedGet.mockResolvedValue(okResponse(200));
        const { getExchangeReachability } = await import('../ExchangeReachability');

        await getExchangeReachability();
        vi.advanceTimersByTime(59_000);
        const second = await getExchangeReachability();

        expect(mockedGet).toHaveBeenCalledTimes(5);
        expect(second.cached).toBe(true);
    });
});
