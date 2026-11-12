import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { planDemoSeed, applyDemoSeed, REBUILT_DEMOS, validateWithModels, mongoReplace } from '../seedDemoV2';
import { Trade } from '../../models/Trade';
import { Order } from '../../models/Order';
import { FeeSnapshot } from '../../models/FeeSnapshot';

const MODELS = { trades: Trade, orders: Order, fee_snapshots: FeeSnapshot } as any;

const trade = (acc: string, extra: Record<string, unknown> = {}) => ({
    accountId: acc, userId: acc, exchange: 'binance', dataSource: 'synthetic-demo', symbol: 'BTCUSDT', tradeId: 'v2:t:0',
    orderId: 'o1', side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 42000.5, quantity: 0.01, notional: 420.005,
    fee: 0.420005, feeUsd: 0.420005, feeAsset: 'USDT', executedAt: '2024-01-15T14:00:00.336Z', ...extra,
});
const order = (acc: string, extra: Record<string, unknown> = {}) => ({
    accountId: acc, exchange: 'binance', dataSource: 'synthetic-demo', symbol: 'BTCUSDT', orderId: 'o1', side: 'BUY',
    type: 'MARKET', origQty: 0.01, executedQty: 0.01, cummulativeQuoteQty: 420.005, price: null, timeInForce: null,
    status: 'FILLED', createdAt: '2024-01-15T14:00:00.000Z', updatedAt: '2024-01-15T14:00:00.336Z', restingMs: null, ...extra,
});
const snap = (acc: string) => ({
    accountId: acc, exchange: 'binance', symbol: 'BTCUSDT', source: 'published-schedule',
    standard: { maker: 0.001, taker: 0.001, buyer: 0, seller: 0 }, tax: { maker: 0, taker: 0, buyer: 0, seller: 0 },
    special: { maker: 0, taker: 0, buyer: 0, seller: 0 },
    discount: { enabledForAccount: false, enabledForSymbol: false, asset: null, rate: 1 }, fetchedAt: '2024-01-16T00:00:00.000Z',
});
const files = (acc: string) => ({ trades: [trade(acc)], orders: [order(acc)], fee_snapshots: [snap(acc)] });

describe('planDemoSeed', () => {
    it('covers exactly the three rebuilt Binance demos', () => {
        expect([...REBUILT_DEMOS]).toEqual(['demo-aggressive', 'demo-moderate', 'demo-disciplined']);
    });

    it('converts dates and counts documents per demo', () => {
        const plan = planDemoSeed({ 'demo-moderate': files('demo-moderate') });
        const p = plan['demo-moderate'];
        expect(p.counts).toEqual({ trades: 1, orders: 1, feeSnapshots: 1 });
        expect(p.trades[0].executedAt).toEqual(new Date('2024-01-15T14:00:00.336Z'));
        expect(p.orders[0].createdAt).toEqual(new Date('2024-01-15T14:00:00.000Z'));
        expect(p.feeSnapshots[0].fetchedAt).toEqual(new Date('2024-01-16T00:00:00.000Z'));
    });

    it.each([
        ['a non-demo account', { 'acct-1': files('acct-1') }],
        ['a demo that was not rebuilt', { 'demo-okx': files('demo-okx') }],
        ['a document of another account inside a demo file', { 'demo-moderate': { ...files('demo-moderate'), trades: [trade('demo-aggressive')] } }],
        ['a real-user document', { 'demo-moderate': { ...files('demo-moderate'), orders: [order('demo-moderate', { dataSource: 'real-user' })] } }],
        ['a fee snapshot that claims to be an account answer', { 'demo-moderate': { ...files('demo-moderate'), fee_snapshots: [{ ...snap('demo-moderate'), source: 'account' }] } }],
        ['an unparseable date', { 'demo-moderate': { ...files('demo-moderate'), trades: [trade('demo-moderate', { executedAt: 'yesterday' })] } }],
    ])('refuses %s', (_name, input) => {
        expect(() => planDemoSeed(input as any)).toThrow();
    });
});

describe('applyDemoSeed', () => {
    it('replaces each demo account\'s trades, orders and snapshots, and nothing else', async () => {
        const calls: string[] = [];
        const io = {
            replace: async (collection: string, accountId: string, docs: unknown[]) => { calls.push(`${collection}:${accountId}:${docs.length}`); },
        };
        const plan = planDemoSeed({ 'demo-moderate': files('demo-moderate'), 'demo-disciplined': files('demo-disciplined') });
        await applyDemoSeed(plan, io);
        expect(calls).toEqual([
            'trades:demo-disciplined:1', 'orders:demo-disciplined:1', 'fee_snapshots:demo-disciplined:1',
            'trades:demo-moderate:1', 'orders:demo-moderate:1', 'fee_snapshots:demo-moderate:1',
        ]);
    });

    it('refuses a plan for any account outside the rebuilt demos even if built by hand', async () => {
        const io = { replace: async () => { throw new Error('must not be called'); } };
        await expect(applyDemoSeed({ 'acct-1': { trades: [], orders: [], feeSnapshots: [], counts: { trades: 0, orders: 0, feeSnapshots: 0 } } } as any, io)).rejects.toThrow();
    });
});

describe('dry-run schema validation and the safe replace (review M2, medium 2)', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterAll(async () => {
        for (const m of [Trade, Order, FeeSnapshot]) await (m as any).deleteMany({ accountId: { $in: ['demo-moderate', 'acct-keep'] } });
    });

    it('the dry run reports every document the schemas would reject', () => {
        const plan = planDemoSeed({ 'demo-moderate': { ...files('demo-moderate'), orders: [order('demo-moderate', { side: 'HOLD' })] } });
        const errors = validateWithModels(plan, MODELS);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(/^orders demo-moderate #0: /);
        expect(validateWithModels(planDemoSeed({ 'demo-moderate': files('demo-moderate') }), MODELS)).toEqual([]);
    });

    it('inserts the new documents first, then removes only that account\'s other documents', async () => {
        await Trade.create([trade('demo-moderate', { tradeId: 'syn-old-1' }), trade('acct-keep', { tradeId: 'other', dataSource: 'real-user' })]);
        const replace = mongoReplace(MODELS);
        const plan = planDemoSeed({ 'demo-moderate': files('demo-moderate') });
        await replace('trades', 'demo-moderate', plan['demo-moderate'].trades);
        expect((await Trade.find({ accountId: 'demo-moderate' }).lean()).map((t: any) => t.tradeId)).toEqual(['v2:t:0']);
        expect(await Trade.countDocuments({ accountId: 'acct-keep' })).toBe(1);
    });

    it('when an insert fails, the account keeps its old documents and none of the new ones', async () => {
        await Trade.deleteMany({ accountId: 'demo-moderate' });
        await Trade.create(trade('demo-moderate', { tradeId: 'syn-old-2' }));
        const replace = mongoReplace(MODELS);
        const good = { ...trade('demo-moderate', { tradeId: 'v2:a:0' }), executedAt: new Date('2024-01-15T14:00:00Z') };
        const dup = { ...good };                                  // same unique key: the second insert fails
        await expect(replace('trades', 'demo-moderate', [good, dup])).rejects.toThrow();
        expect((await Trade.find({ accountId: 'demo-moderate' }).lean()).map((t: any) => t.tradeId)).toEqual(['syn-old-2']);
    });

    it('refuses any account outside the rebuilt demos', async () => {
        await expect(mongoReplace(MODELS)('trades', 'acct-keep', [])).rejects.toThrow();
        expect(await Trade.countDocuments({ accountId: 'acct-keep' })).toBe(1);
    });
});
