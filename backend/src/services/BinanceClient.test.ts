import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { BinanceClient, BinanceApiError } from './BinanceClient';
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
