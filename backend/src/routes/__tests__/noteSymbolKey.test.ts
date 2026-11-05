import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { User } from '../../models/User';
import { Trade } from '../../models/Trade';
import { issueTokenPair } from '../../services/authService';

loadEnv();
const app = createApp();

// Same Binance trade id 7 on two symbols is two trades (R1). A note must land on exactly one.
describe('PATCH /audit/trades/:tradeId/note uses symbol to pick the trade', () => {
    let token: string; let id: string;
    const base = (symbol: string) => ({
        userId: id, accountId: id, exchange: 'binance', symbol, tradeId: '7', orderId: 'o', side: 'BUY', orderType: 'MARKET',
        isMaker: false, executionPrice: 100, quantity: 1, notional: 100, fee: 0.1, feeAsset: 'USDT', executedAt: new Date('2024-01-02T00:00:00Z'),
        dataSource: 'real-user',
    });
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const u = await User.create({ email: `test_notesym_${Date.now()}@example.com`, emailVerified: true });
        id = u._id.toString();
        token = (await issueTokenPair(id)).accessToken;
        await Trade.create([base('BTCUSDT'), base('ETHUSDT')]);
    });
    afterAll(async () => { await Trade.deleteMany({ accountId: id }); await User.deleteMany({ email: /^test_notesym_/ }); });

    it('with symbol: only that trade gets the note', async () => {
        const res = await request(app).patch('/api/audit/trades/7/note').set('Authorization', `Bearer ${token}`).send({ note: 'eth only', symbol: 'ETHUSDT' });
        expect(res.status).toBe(200);
        expect((await Trade.findOne({ accountId: id, symbol: 'ETHUSDT' }))!.note).toBe('eth only');
        expect((await Trade.findOne({ accountId: id, symbol: 'BTCUSDT' }))!.note).toBeFalsy();
    });

    it('without symbol while the id is ambiguous: 409, nothing written', async () => {
        const res = await request(app).patch('/api/audit/trades/7/note').set('Authorization', `Bearer ${token}`).send({ note: 'which one?' });
        expect(res.status).toBe(409);
        expect((await Trade.findOne({ accountId: id, symbol: 'BTCUSDT' }))!.note).toBeFalsy();
    });
});
