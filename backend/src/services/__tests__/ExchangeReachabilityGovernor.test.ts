import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
    const mockGet = vi.fn();
    return { default: { get: mockGet }, get: mockGet };
});

import { probeAllExchanges } from '../ExchangeReachability';
import { BinanceBanError, BinanceGovernor } from '../binanceGovernor';

/**
 * Fifth order of 2026-11-22, step 0c: the api.binance.com probe says where a 418 came from.
 *  - 'governor_paused': the governor holds a pause from an earlier 418/429; nothing is sent (no weight spent).
 *  - 'binance_sent': the request went to Binance; its 418/429 is recorded so every caller pauses.
 * Fake clock T0; GET /api/v3/time is IP weight 1 (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-endpoints).
 */
const mockedGet = axios.get as any;
const BINANCE = 'https://api.binance.com/api/v3/time';
const T0 = 1_700_000_000_000;

function govAt() {
    const clock = { t: T0 };
    const gov = new BinanceGovernor({ now: () => clock.t, sleep: async (ms) => { clock.t += ms; } });
    return { clock, gov };
}
const res = (status: number, headers: Record<string, string> = {}) => ({ status, headers, data: {} });
const binanceCalls = () => mockedGet.mock.calls.filter((c: unknown[]) => c[0] === BINANCE).length;

describe('probe of api.binance.com and the shared governor', () => {
    beforeEach(() => { mockedGet.mockReset(); });

    it('during a ban: no request to api.binance.com; 418 governor_paused, 120 - 30 = 90 s left, Retry-After 120 as received', async () => {
        const { gov, clock } = govAt();
        gov.observe(1, { status: 418, headers: { 'retry-after': '120' } });   // banned until T0 + 120 000
        clock.t = T0 + 30_000;
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(gov)).find((r) => r.exchange === 'binance')!;
        expect(binanceCalls()).toBe(0);
        expect(mockedGet).toHaveBeenCalledTimes(4);                         // the other four targets still probed
        expect(b).toMatchObject({ status: 'rate_limited', httpStatus: 418, source: 'governor_paused', pauseRemainingS: 90, retryAfterS: 120 });
        expect(gov.snapshot().used).toBe(1);                                 // the probe spent no weight
    });

    it('during a 429 pause: 429 governor_paused, Retry-After 7 received at T0, 2.5 s later ceil(4.5) = 5 s left', async () => {
        const { gov, clock } = govAt();
        gov.observe(1, { status: 429, headers: { 'retry-after': '7' } });
        clock.t = T0 + 2_500;
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(gov)).find((r) => r.exchange === 'binance')!;
        expect(binanceCalls()).toBe(0);
        expect(b).toMatchObject({ httpStatus: 429, source: 'governor_paused', pauseRemainingS: 5, retryAfterS: 7 });
    });

    it('a fresh 418 with Retry-After 600: binance_sent, 600 s left, and the governor now refuses every caller', async () => {
        const { gov } = govAt();
        mockedGet.mockImplementation(async (url: string) => (url === BINANCE ? res(418, { 'retry-after': '600' }) : res(200)));
        const b = (await probeAllExchanges(gov)).find((r) => r.exchange === 'binance')!;
        expect(binanceCalls()).toBe(1);
        expect(b).toMatchObject({ status: 'rate_limited', httpStatus: 418, source: 'binance_sent', pauseRemainingS: 600, retryAfterS: 600 });
        expect(gov.snapshot().bannedForMs).toBe(600_000);
        await expect(gov.acquire(20)).rejects.toBeInstanceOf(BinanceBanError);
    });

    it('a fresh 418 without Retry-After: retryAfterS null (not received), pause 120 s (the governor default)', async () => {
        const { gov } = govAt();
        mockedGet.mockImplementation(async (url: string) => (url === BINANCE ? res(418) : res(200)));
        const b = (await probeAllExchanges(gov)).find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ source: 'binance_sent', retryAfterS: null, pauseRemainingS: 120 });
    });

    it('200: reachable, binance_sent, no pause, Retry-After null; weight 1 counted', async () => {
        const { gov } = govAt();
        mockedGet.mockResolvedValue(res(200, { 'x-mbx-used-weight-1m': '1' }));
        const b = (await probeAllExchanges(gov)).find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ status: 'reachable', httpStatus: 200, source: 'binance_sent', pauseRemainingS: 0, retryAfterS: null });
        expect(gov.snapshot().used).toBe(1);
    });

    it('binance-data (data-api.binance.vision) is not governed: its 418 does not pause api.binance.com callers', async () => {
        const { gov } = govAt();
        mockedGet.mockImplementation(async (url: string) => (url.includes('data-api.binance.vision') ? res(418, { 'retry-after': '60' }) : res(200)));
        const results = await probeAllExchanges(gov);
        expect(results.find((r) => r.exchange === 'binance-data')).toMatchObject({ status: 'rate_limited', httpStatus: 418 });
        expect(results.find((r) => r.exchange === 'binance-data')).not.toHaveProperty('source');
        expect(gov.snapshot().bannedForMs).toBe(0);
    });
});
