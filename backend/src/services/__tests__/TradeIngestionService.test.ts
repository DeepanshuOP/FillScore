import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { TradeIngestionService } from '../TradeIngestionService';
import { Trade } from '../../models/Trade';
import { BinanceClient } from '../BinanceClient';
import { loadEnv } from '../../config/env';
import { ObjectId } from 'mongodb';

loadEnv();

const mockFetchTradesForWindow = vi.fn();
const mockFetchRecentTrades = vi.fn();

vi.mock('../BinanceClient', () => {
    return {
        BinanceClient: class {
            fetchTradesForWindow = mockFetchTradesForWindow;
            fetchRecentTrades = mockFetchRecentTrades;
        }
    };
});

describe('TradeIngestionService', () => {
    let service: TradeIngestionService;
    let realUserId: string;

    const defaultTrade = {
        symbol: 'BTCUSDT',
        id: 12345,
        orderId: 67890,
        price: '50000.00',
        qty: '1.0',
        quoteQty: '50000.00',
        commission: '5.00',
        commissionAsset: 'USDT',
        time: Date.now(),
        isBuyer: true,
        isMaker: true,
        isBestMatch: true
    };

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
        service = new TradeIngestionService();
        realUserId = new ObjectId().toString();
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await Trade.deleteMany({});
        vi.clearAllMocks();
    });

    it('ingesting for accountId=demo-disciplined writes dataSource synthetic-demo', async () => {
        mockFetchRecentTrades.mockResolvedValue([defaultTrade]);
        mockFetchTradesForWindow.mockResolvedValue([defaultTrade]);

        const result = await service.ingestForUser('demo-disciplined', 'k', 's', 'BTCUSDT', 1);
        expect(result.inserted).toBe(1);

        const trade = await Trade.findOne({ accountId: 'demo-disciplined' });
        expect(trade).toBeDefined();
        expect(trade?.accountId).toBe('demo-disciplined');
        expect(trade?.dataSource).toBe('synthetic-demo');
    });

    it('ingesting for a real ObjectId accountId writes dataSource real-user', async () => {
        mockFetchRecentTrades.mockResolvedValue([defaultTrade]);
        mockFetchTradesForWindow.mockResolvedValue([defaultTrade]);

        const result = await service.ingestForUser(realUserId, 'k', 's', 'BTCUSDT', 1);
        expect(result.inserted).toBe(1);

        const trade = await Trade.findOne({ accountId: realUserId });
        expect(trade).toBeDefined();
        expect(trade?.accountId).toBe(realUserId);
        expect(trade?.dataSource).toBe('real-user');
    });

    describe('fetchAllTrades - fast sync strategy', () => {
        const startTime = 1000000;
        const endTime = 2000000;

        it('10 rows returned (<1000) -> exactly ONE client call, no day-loop, correct filtering by startTime', async () => {
            const trades = Array.from({ length: 10 }, (_, i) => ({
                ...defaultTrade,
                id: i + 1,
                time: startTime + i * 1000
            }));
            mockFetchRecentTrades.mockResolvedValueOnce(trades);

            const result = await service.fetchAllTrades({
                symbol: 'BTCUSDT',
                startTime,
                endTime,
                userId: 'user1'
            }, new BinanceClient('k', 's'));

            expect(mockFetchRecentTrades).toHaveBeenCalledTimes(1);
            expect(mockFetchRecentTrades).toHaveBeenCalledWith('BTCUSDT', 1000);
            expect(mockFetchTradesForWindow).toHaveBeenCalledTimes(0);
            expect(result).toHaveLength(10);
        });

        it('rows older than startTime are excluded', async () => {
            const trades = [
                { ...defaultTrade, id: 1, time: startTime - 5000 }, // older
                { ...defaultTrade, id: 2, time: startTime + 5000 }, // newer
                { ...defaultTrade, id: 3, time: startTime + 10000 } // newer
            ];
            mockFetchRecentTrades.mockResolvedValueOnce(trades);

            const result = await service.fetchAllTrades({
                symbol: 'BTCUSDT',
                startTime,
                endTime,
                userId: 'user1'
            }, new BinanceClient('k', 's'));

            expect(mockFetchRecentTrades).toHaveBeenCalledTimes(1);
            expect(mockFetchTradesForWindow).toHaveBeenCalledTimes(0);
            expect(result).toHaveLength(2);
            expect(result.map(t => t.id)).toEqual([2, 3]);
        });

        it('exactly 1000 rows with oldest older than startTime -> ONE call, no fallback', async () => {
            const trades = Array.from({ length: 1000 }, (_, i) => ({
                ...defaultTrade,
                id: i + 1,
                time: i === 0 ? startTime - 1000 : startTime + i * 10
            }));
            mockFetchRecentTrades.mockResolvedValueOnce(trades);

            const result = await service.fetchAllTrades({
                symbol: 'BTCUSDT',
                startTime,
                endTime,
                userId: 'user1'
            }, new BinanceClient('k', 's'));

            expect(mockFetchRecentTrades).toHaveBeenCalledTimes(1);
            expect(mockFetchTradesForWindow).toHaveBeenCalledTimes(0);
            expect(result).toHaveLength(999); // 1st excluded, rest included
        });

        it('exactly 1000 rows with oldest NEWER than startTime -> fallback engages', async () => {
            const trades = Array.from({ length: 1000 }, (_, i) => ({
                ...defaultTrade,
                id: i + 1,
                time: startTime + 100 + i * 10 // all newer than startTime
            }));
            mockFetchRecentTrades.mockResolvedValueOnce(trades);
            mockFetchTradesForWindow.mockResolvedValue([]);

            await service.fetchAllTrades({
                symbol: 'BTCUSDT',
                startTime,
                endTime,
                userId: 'user1'
            }, new BinanceClient('k', 's'));

            expect(mockFetchRecentTrades).toHaveBeenCalledTimes(1);
            expect(mockFetchTradesForWindow).toHaveBeenCalled();
        });

        it('zero rows -> one call, empty result, no day-loop', async () => {
            mockFetchRecentTrades.mockResolvedValueOnce([]);

            const result = await service.fetchAllTrades({
                symbol: 'BTCUSDT',
                startTime,
                endTime,
                userId: 'user1'
            }, new BinanceClient('k', 's'));

            expect(mockFetchRecentTrades).toHaveBeenCalledTimes(1);
            expect(mockFetchTradesForWindow).toHaveBeenCalledTimes(0);
            expect(result).toEqual([]);
        });
    });
});
