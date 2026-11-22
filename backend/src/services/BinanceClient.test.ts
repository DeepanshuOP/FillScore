import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { BinanceClient, BinanceApiError } from './BinanceClient';
import { BinanceGovernor } from './binanceGovernor';
import { BinanceRawTrade } from '../types';

vi.mock('axios', () => {
    const mockGet = vi.fn();
    return {
        default: {
            create: vi.fn(() => ({
                get: mockGet,
            })),
            isAxiosError: vi.fn((err: any) => Boolean(err && err.isAxiosError)),
        },
        create: vi.fn(() => ({
            get: vi.fn(),
        })),
        isAxiosError: vi.fn((err: any) => Boolean(err && err.isAxiosError)),
    };
});

describe('BinanceClient - fetchRecentTrades', () => {
    let client: BinanceClient;
    let mockGet: any;

    const dummyTrade: BinanceRawTrade = {
        symbol: 'BTCUSDT',
        id: 1,
        orderId: 100,
        price: '50000.00',
        qty: '1.0',
        quoteQty: '50000.00',
        commission: '5.00',
        commissionAsset: 'USDT',
        time: 1700000000000,
        isBuyer: true,
        isMaker: true,
        isBestMatch: true
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet = vi.fn();
        (axios.create as any).mockReturnValue({
            get: mockGet,
        });
        client = new BinanceClient('test_key', 'test_secret');
    });

    it('signs the query after the wait for the weight budget, so its timestamp is fresh (-1021 otherwise)', async () => {
        // a governor that "waits" 60 s inside acquire: the wall clock moves before the governed call runs
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const waiting = new BinanceGovernor();
            const realRun = waiting.run.bind(waiting);
            vi.spyOn(waiting, 'run').mockImplementation((async (w: number, call: () => Promise<any>) => {
                vi.setSystemTime(new Date('2024-01-01T00:01:00.000Z'));     // 60 000 ms later
                return realRun(w, call);
            }) as any);
            const slow = new BinanceClient('test_key', 'test_secret', waiting);
            mockGet.mockResolvedValueOnce({ data: [dummyTrade] });
            await slow.fetchRecentTrades('BTCUSDT', 10);
            const url = mockGet.mock.calls[0][0] as string;
            expect(url).toContain(`timestamp=${Date.parse('2024-01-01T00:01:00.000Z')}`);   // 1704067260000, not 1704067200000
            expect(url).not.toContain('timestamp=1704067200000');
        } finally {
            vi.useRealTimers();
        }
    });

    it('sends no startTime/endTime params and passes limit', async () => {
        mockGet.mockResolvedValueOnce({ data: [dummyTrade] });

        const trades = await client.fetchRecentTrades('BTCUSDT', 500);
        expect(trades).toEqual([dummyTrade]);
        expect(mockGet).toHaveBeenCalledTimes(1);

        const urlCall = mockGet.mock.calls[0][0];
        expect(urlCall).toContain('/api/v3/myTrades?');
        expect(urlCall).toContain('symbol=BTCUSDT');
        expect(urlCall).toContain('limit=500');
        expect(urlCall).not.toContain('startTime=');
        expect(urlCall).not.toContain('endTime=');
    });

    it('returns rows on success without logging sensitive info', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        mockGet.mockResolvedValueOnce({ data: [dummyTrade, dummyTrade] });

        const trades = await client.fetchRecentTrades('BTCUSDT');
        expect(trades).toHaveLength(2);

        const urlCall = mockGet.mock.calls[0][0];
        expect(urlCall).toContain('limit=1000'); // default 1000

        for (const call of [...warnSpy.mock.calls, ...logSpy.mock.calls]) {
            const msg = call.join(' ');
            expect(msg).not.toContain('test_key');
            expect(msg).not.toContain('test_secret');
            expect(msg).not.toContain('/api/v3/myTrades');
        }
        warnSpy.mockRestore();
        logSpy.mockRestore();
    });

    it('retries once on 429 with Retry-After then succeeds', async () => {
        const error429 = {
            isAxiosError: true,
            response: {
                status: 429,
                headers: { 'retry-after': '1' },
                data: { msg: 'Rate limit' }
            },
            message: 'Request failed with status code 429'
        };
        mockGet.mockRejectedValueOnce(error429).mockResolvedValueOnce({ data: [dummyTrade] });

        const sleepSpy = vi.spyOn(client as any, 'sleep').mockResolvedValue(undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const trades = await client.fetchRecentTrades('BTCUSDT', 1000);
        expect(trades).toEqual([dummyTrade]);
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(sleepSpy).toHaveBeenCalledWith(1000);

        sleepSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('throws BinanceApiError on other errors', async () => {
        const error400 = {
            isAxiosError: true,
            response: {
                status: 400,
                data: { msg: 'Bad Request' }
            },
            message: 'Request failed with status code 400'
        };
        mockGet.mockRejectedValueOnce(error400);

        await expect(client.fetchRecentTrades('BTCUSDT')).rejects.toThrow(BinanceApiError);
    });
});

describe('BinanceClient - fetchCommission (GET /api/v3/account/commission)', () => {
    // Example response of "Query Commission Rates (USER_DATA)", read 2026-11-22 at
    // https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints (weight 20, signed).
    // /api/v3/tradeFee, which the old fetchFeeRate called, is not listed on that page.
    const docsExample = {
        symbol: 'BTCUSDT',
        standardCommission: { maker: '0.00000010', taker: '0.00000020', buyer: '0.00000030', seller: '0.00000040' },
        taxCommission: { maker: '0.00000112', taker: '0.00000114', buyer: '0.00000118', seller: '0.00000116' },
        specialCommission: { maker: '0.01000000', taker: '0.02000000', buyer: '0.03000000', seller: '0.04000000' },
        discount: { enabledForAccount: true, enabledForSymbol: true, discountAsset: 'BNB', discount: '0.75000000' },
    };
    let mockGet: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGet = vi.fn();
        (axios.create as any).mockReturnValue({ get: mockGet });
    });

    it('calls the documented path, signed, with symbol, and parses every part as numbers', async () => {
        mockGet.mockResolvedValueOnce({ data: docsExample, status: 200, headers: {} });
        const c = await new BinanceClient('test_key', 'test_secret', new BinanceGovernor()).fetchCommission('BTCUSDT');
        const url = mockGet.mock.calls[0][0] as string;
        expect(url.startsWith('/api/v3/account/commission?')).toBe(true);
        expect(url).not.toContain('tradeFee');
        expect(url).toContain('symbol=BTCUSDT');
        expect(url).toMatch(/&signature=[0-9a-f]{64}$/);
        // '0.00000010' -> 1e-7, '0.01000000' -> 0.01, '0.00000112' -> 1.12e-6, discount '0.75000000' -> 0.75
        expect(c).toEqual({
            symbol: 'BTCUSDT',
            standard: { maker: 1e-7, taker: 2e-7, buyer: 3e-7, seller: 4e-7 },
            tax: { maker: 1.12e-6, taker: 1.14e-6, buyer: 1.18e-6, seller: 1.16e-6 },
            special: { maker: 0.01, taker: 0.02, buyer: 0.03, seller: 0.04 },
            discount: { enabledForAccount: true, enabledForSymbol: true, asset: 'BNB', rate: 0.75 },
        });
    });

    it('reserves weight 20 in the shared governor (no header: two calls use 20 + 20 = 40)', async () => {
        const gov = new BinanceGovernor({ limit: 100, fraction: 0.5, now: () => 0, sleep: async () => {} });
        mockGet.mockResolvedValue({ data: docsExample, status: 200, headers: {} });
        const client = new BinanceClient('k', 's', gov);
        await client.fetchCommission('BTCUSDT');
        await client.fetchCommission('BTCUSDT');
        expect(gov.snapshot().used).toBe(40);
    });

    it('the old tradeFee array shape (no standardCommission) is an error, never zero rates', async () => {
        mockGet.mockResolvedValueOnce({ data: [{ symbol: 'BTCUSDT', makerCommission: '0.001', takerCommission: '0.001' }], status: 200, headers: {} });
        await expect(new BinanceClient('k', 's', new BinanceGovernor()).fetchCommission('BTCUSDT')).rejects.toThrow(BinanceApiError);
    });

    it('an HTTP error becomes BinanceApiError with its status', async () => {
        mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 400, headers: {}, data: { msg: 'bad' } }, message: 'x' });
        await expect(new BinanceClient('k', 's', new BinanceGovernor()).fetchCommission('BTCUSDT')).rejects.toMatchObject({ statusCode: 400 });
    });

    it('the undocumented fetchFeeRate is gone', () => {
        expect((BinanceClient.prototype as any).fetchFeeRate).toBeUndefined();
    });
});
