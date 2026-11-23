import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

vi.mock('axios', () => {
    const mockGet = vi.fn();
    return { default: { get: mockGet }, get: mockGet };
});

import { probeAllExchanges } from '../ExchangeReachability';
import { BinanceBanError, BinanceGovernor } from '../binanceGovernor';

/**
 * Design v5 step 0 (2026-11-23): the Binance probe goes to data-api.binance.vision, never to api.binance.com.
 *  - Binance lists GET /api/v3/time among the endpoints served on data-api.binance.vision
 *    (https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, read 2026-11-23).
 *  - The probe goes through the market-data governor (its own budget); a 418/429 it receives pauses market-data callers only.
 *  - The state of api.binance.com (signed account calls) is read from the account governor: no request is sent there.
 * Fake clock T0; GET /api/v3/time is IP weight 1 (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-endpoints).
 */
const mockedGet = axios.get as any;
const DATA_TIME = 'https://data-api.binance.vision/api/v3/time';
const T0 = 1_700_000_000_000;

function govsAt() {
    const clock = { t: T0 };
    const mk = () => new BinanceGovernor({ now: () => clock.t, sleep: async (ms) => { clock.t += ms; } });
    return { clock, data: mk(), account: mk() };
}
const res = (status: number, headers: Record<string, string> = {}) => ({ status, headers, data: {} });
const callsTo = (needle: string) => mockedGet.mock.calls.filter((c: unknown[]) => String(c[0]).includes(needle)).length;

describe('Binance probe on data-api.binance.vision, account API state from the governor', () => {
    beforeEach(() => { mockedGet.mockReset(); });

    it('never sends to api.binance.com; four targets; the binance entry names its host', async () => {
        const { data, account } = govsAt();
        mockedGet.mockResolvedValue(res(200));
        const results = await probeAllExchanges(data, account);
        expect(callsTo('api.binance.com')).toBe(0);
        expect(callsTo(DATA_TIME)).toBe(1);
        expect(mockedGet).toHaveBeenCalledTimes(4);                          // binance (data host), bybit, okx, bybit-alt
        expect(results.map((r) => r.exchange).sort()).toEqual(['binance', 'bybit', 'bybit-alt', 'okx']);
        const b = results.find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ status: 'reachable', httpStatus: 200, host: 'data-api.binance.vision', source: 'binance_sent' });
    });

    it('api.binance.com banned (418, Retry-After 418 at T0), 30 s later: market data still probed and reachable; account API paused 418 - 30 = 388 s', async () => {
        const { data, account, clock } = govsAt();
        account.observe(20, { status: 418, headers: { 'retry-after': '418' } });   // e.g. a signed sync got the ban
        clock.t = T0 + 30_000;
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(callsTo('api.binance.com')).toBe(0);
        expect(b).toMatchObject({ status: 'reachable', httpStatus: 200, source: 'binance_sent' });
        expect(b.accountApi).toEqual({ host: 'api.binance.com', paused: true, httpStatus: 418, pauseRemainingS: 388, retryAfterS: 418 });
        expect(account.snapshot().used).toBe(20);                             // nothing added by the probe
    });

    it('no account pause: accountApi paused false, 0 s, no status', async () => {
        const { data, account } = govsAt();
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(b.accountApi).toEqual({ host: 'api.binance.com', paused: false, httpStatus: null, pauseRemainingS: 0, retryAfterS: null });
    });

    it('market-data governor banned (418, Retry-After 120), 30 s later: no request to data-api; 418 governor_paused, 90 s left', async () => {
        const { data, account, clock } = govsAt();
        data.observe(1, { status: 418, headers: { 'retry-after': '120' } });
        clock.t = T0 + 30_000;
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(callsTo(DATA_TIME)).toBe(0);
        expect(mockedGet).toHaveBeenCalledTimes(3);
        expect(b).toMatchObject({ status: 'rate_limited', httpStatus: 418, source: 'governor_paused', pauseRemainingS: 90, retryAfterS: 120 });
        expect(data.snapshot().used).toBe(1);
    });

    it('during a 429 pause on market data: 429 governor_paused, Retry-After 7 received at T0, 2.5 s later ceil(4.5) = 5 s left', async () => {
        const { data, account, clock } = govsAt();
        data.observe(1, { status: 429, headers: { 'retry-after': '7' } });
        clock.t = T0 + 2_500;
        mockedGet.mockResolvedValue(res(200));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(callsTo(DATA_TIME)).toBe(0);
        expect(b).toMatchObject({ httpStatus: 429, source: 'governor_paused', pauseRemainingS: 5, retryAfterS: 7 });
    });

    it('a fresh 418 from data-api with Retry-After 600: binance_sent, 600 s; market data refused, account calls not', async () => {
        const { data, account } = govsAt();
        mockedGet.mockImplementation(async (url: string) => (url === DATA_TIME ? res(418, { 'retry-after': '600' }) : res(200)));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ status: 'rate_limited', httpStatus: 418, source: 'binance_sent', pauseRemainingS: 600, retryAfterS: 600 });
        expect(data.snapshot().bannedForMs).toBe(600_000);
        await expect(data.acquire(2)).rejects.toBeInstanceOf(BinanceBanError);
        expect(account.snapshot().bannedForMs).toBe(0);
        await expect(account.acquire(20)).resolves.toBeUndefined();
    });

    it('a fresh 418 without Retry-After: retryAfterS null (not received), pause 120 s (the governor default)', async () => {
        const { data, account } = govsAt();
        mockedGet.mockImplementation(async (url: string) => (url === DATA_TIME ? res(418) : res(200)));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ source: 'binance_sent', retryAfterS: null, pauseRemainingS: 120 });
    });

    it('200: weight 1 counted on the market-data governor, 0 on the account governor', async () => {
        const { data, account } = govsAt();
        mockedGet.mockResolvedValue(res(200, { 'x-mbx-used-weight-1m': '1' }));
        const b = (await probeAllExchanges(data, account)).find((r) => r.exchange === 'binance')!;
        expect(b).toMatchObject({ status: 'reachable', pauseRemainingS: 0, retryAfterS: null });
        expect(data.snapshot().used).toBe(1);
        expect(account.snapshot().used).toBe(0);
    });
});
