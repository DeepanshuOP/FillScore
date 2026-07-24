import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { TradeIngestionService } from '../TradeIngestionService';
import { Trade } from '../../models/Trade';
import { BinanceClient } from '../BinanceClient';
import { loadEnv } from '../../config/env';
import { ObjectId } from 'mongodb';

loadEnv();

vi.mock('../BinanceClient', () => {
    return {
        BinanceClient: class {
            fetchTradesForWindow = vi.fn().mockResolvedValue([
                {
                    symbol: 'BTCUSDT',
                    id: 12345,
                    orderId: 67890,
                    orderListId: -1,
                    price: '50000.00',
                    qty: '1.0',
                    quoteQty: '50000.00',
                    commission: '5.00',
                    commissionAsset: 'USDT',
                    time: Date.now(),
                    isBuyer: true,
                    isMaker: true,
                    isBestMatch: true
                }
            ]);
        }
    };
});

describe('TradeIngestionService', () => {
    let service: TradeIngestionService;
    let realUserId: string;

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
        const result = await service.ingestForUser('demo-disciplined', 'k', 's', 'BTCUSDT', 1);
        expect(result.inserted).toBe(1);

        const trade = await Trade.findOne({ accountId: 'demo-disciplined' });
        expect(trade).toBeDefined();
        expect(trade?.accountId).toBe('demo-disciplined');
        expect(trade?.dataSource).toBe('synthetic-demo');
    });

    it('ingesting for a real ObjectId accountId writes dataSource real-user', async () => {
        const result = await service.ingestForUser(realUserId, 'k', 's', 'BTCUSDT', 1);
        expect(result.inserted).toBe(1);

        const trade = await Trade.findOne({ accountId: realUserId });
        expect(trade).toBeDefined();
        expect(trade?.accountId).toBe(realUserId);
        expect(trade?.dataSource).toBe('real-user');
    });
});
