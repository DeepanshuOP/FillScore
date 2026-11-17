import request from 'supertest';
import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Order } from '../../models/Order';
import { OrderMeasurement } from '../../models/OrderMeasurement';
import { ScoreV2 } from '../../models/ScoreV2';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';
import { buildPack, publicKeyFingerprint } from '../../services/evidencePack';

// M5 §1-§2: the signed evidence pack of an account (scorecard, or best-execution), its public key and its verify endpoint.
loadEnv();
const app = createApp();
const gen = () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pub: publicKey.export({ type: 'spki', format: 'pem' }) as string };
};
const KEY = gen();

const sf = (total: number) => ({ executionBps: total, spreadBps: total / 2, impactTimingBps: total / 2, opportunityBps: 0, feesBps: 1, totalBps: total + 1, intendedNotional: 10000, fillRatio: 1 });
const meas = (accountId: string, orderId: string, total: number) => ({
    accountId, exchange: 'binance', symbol: 'BTCUSDT', orderId, version: '1.0.0', side: 1, tradeIds: [`t-${orderId}`], arrivalMs: Date.UTC(2024, 0, 15, 14), endMs: null, endBasis: 'filled',
    arrivalMid: 40000, endMid: null, shortfall: sf(total), unmeasuredReason: null, measuredAt: new Date('2024-03-01'),
    marketDataRefs: [{ source: 'data.binance.vision', dataset: 'spot/daily/aggTrades', symbol: 'BTCUSDT', date: '2024-01-15', window: null, sha256: 'a'.repeat(64) }],
});
const ord = (accountId: string, orderId: string) => ({
    accountId, exchange: 'binance', symbol: 'BTCUSDT', orderId, side: 'BUY', type: 'MARKET', origQty: 0.5, executedQty: 0.5, status: 'FILLED', restingMs: null,
    createdAt: new Date('2024-01-15T14:00:00Z'), updatedAt: new Date('2024-01-15T14:00:02Z'), dataSource: 'real-user',
});

describe('evidence pack routes', () => {
    let tokenA = '', idA = '', idB = '';
    const h = () => ({ Authorization: `Bearer ${tokenA}` });
    const prev = process.env.EVIDENCE_SIGNING_KEY;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'ev-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'ev-b@example.com', emailVerified: true });
        idA = a._id.toString(); idB = b._id.toString();
        tokenA = (await issueTokenPair(idA)).accessToken;
        await OrderMeasurement.collection.insertMany([meas(idA, 'a1', 2), meas(idA, 'a2', 4), meas(idB, 'b1', 99)] as any);
        await Order.collection.insertMany([ord(idA, 'a1'), ord(idA, 'a2'), ord(idB, 'b1')] as any);
        await ScoreV2.collection.insertOne({ accountId: idA, scoringVersion: 'v2.3.0', versionFileSha256: 'b'.repeat(64), measureVersion: '1.0.0', integrityHash: 'c'.repeat(64),
            computedAt: new Date('2026-11-01'), result: { grade: 'A', composite: 93.4, band: [92, 95], components: {}, fills: 2, orders: 2 } } as any);
    });
    afterAll(async () => {
        for (const m of [Order, OrderMeasurement, ScoreV2]) await (m as any).deleteMany({ accountId: { $in: [idA, idB] } });
        await User.deleteMany({ _id: { $in: [idA, idB] } });
        if (prev === undefined) delete process.env.EVIDENCE_SIGNING_KEY; else process.env.EVIDENCE_SIGNING_KEY = prev;
    });
    afterEach(() => { process.env.EVIDENCE_SIGNING_KEY = KEY.priv; });

    it('without a signing key the pack is refused (503), never written unsigned', async () => {
        delete process.env.EVIDENCE_SIGNING_KEY;
        const res = await request(app).get('/api/evidence/pack').set(h());
        expect(res.status).toBe(503);
        expect(res.body.error).toBe('signing_not_configured');
        expect((await request(app).get('/api/evidence/public-key')).status).toBe(503);
    });

    it('needs a token, or a demo id', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        expect((await request(app).get('/api/evidence/pack')).status).toBe(401);
        expect((await request(app).get('/api/evidence/pack?userId=someone-else')).status).toBe(403);
    });

    it('builds a pack of the account\'s own measurements; it verifies, and it holds nobody else\'s data or the raw account id', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const res = await request(app).get('/api/evidence/pack').set(h());
        expect(res.status).toBe(200);
        const { pack, files } = res.body;
        expect(Object.keys(files).sort()).toEqual(['limits.json', 'market_data.json', 'order_measurements.json', 'scorecard.json']);
        const orders = JSON.parse(files['order_measurements.json']);
        expect(orders.map((o: any) => o.orderId)).toEqual(['a1', 'a2']);               // not b1
        expect(JSON.stringify(res.body)).not.toContain(idA);                           // the account id is not in the pack
        expect(pack.manifest.meta.kind).toBe('scorecard');
        expect(pack.manifest.meta.account).toBe(crypto.createHash('sha256').update(idA).digest('hex').slice(0, 16));
        expect(JSON.parse(files['scorecard.json']).scoring).toMatchObject({ version: 'v2.3.0', integrityHash: 'c'.repeat(64), grade: 'A' });
        const v = await request(app).post('/api/evidence/verify').send({ pack, files });
        expect(v.status).toBe(200);
        expect(v.body).toMatchObject({ valid: true, problems: [], trustedKeyChecked: true });
    });

    it('verify names a changed file and a changed manifest', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const { pack, files } = (await request(app).get('/api/evidence/pack').set(h())).body;
        const bad = await request(app).post('/api/evidence/verify').send({ pack, files: { ...files, 'scorecard.json': files['scorecard.json'].replace('93.4', '99.9') } });
        expect(bad.body.valid).toBe(false);
        expect(bad.body.problems).toEqual(['scorecard.json: the file does not match the SHA-256 in the manifest']);
        const forged = await request(app).post('/api/evidence/verify').send({ pack: { ...pack, manifest: { ...pack.manifest, generatedAt: '2020-01-01T00:00:00.000Z' } }, files });
        expect(forged.body.valid).toBe(false);
        expect(forged.body.problems).toContain('the signature does not match the manifest');
    });

    it('a pack signed by another key verifies by itself but not against the published key', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const other = gen();
        const foreign = buildPack({ meta: { kind: 'scorecard' }, generatedAt: '2026-11-17T00:00:00.000Z', files: { 'x.txt': 'x' } }, other.priv);
        const v = await request(app).post('/api/evidence/verify').send({ pack: foreign, files: { 'x.txt': 'x' } });
        expect(v.body.valid).toBe(false);
        expect(v.body.problems).toContain('the pack was not signed by the trusted key');
    });

    it('publishes its public key and fingerprint', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const res = await request(app).get('/api/evidence/public-key');
        expect(res.status).toBe(200);
        expect(res.body.fingerprint).toBe(publicKeyFingerprint(KEY.pub));
        expect(res.body.publicKeyPem.trim()).toBe(KEY.pub.trim());
        expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
    });

    it('verify refuses a body that is not a pack (400), without crashing', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        expect((await request(app).post('/api/evidence/verify').send({ nope: 1 })).status).toBe(400);
        expect((await request(app).post('/api/evidence/verify').send({ pack: { manifest: 1, signature: 2 }, files: {} })).status).toBe(400);
    });

    it('the best-execution pack adds an execution summary with its limits, "supports your documentation", and no claim of compliance', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const res = await request(app).get('/api/evidence/pack?kind=best-execution').set(h());
        expect(res.status).toBe(200);
        const { pack, files } = res.body;
        expect(pack.manifest.meta.kind).toBe('best-execution');
        expect(Object.keys(files)).toContain('execution-summary.json');
        const summary = JSON.parse(files['execution-summary.json']);
        expect(summary.orders.total).toBe(2);
        expect(summary.statement).toMatch(/supports your documentation/);
        const limits = JSON.parse(files['limits.json']);
        expect(limits.sampleSizes).toMatchObject({ measuredOrders: 2, orders: 2 });
        expect(limits.referenceData[0]).toMatchObject({ source: 'data.binance.vision', sha256: 'a'.repeat(64) });
        expect(JSON.stringify(res.body)).not.toMatch(/complian|certif|guarantee/i);
        expect((await request(app).get('/api/evidence/pack?kind=other').set(h())).status).toBe(400);
    });

    it('a demo account gets a pack labelled as synthetic data', async () => {
        process.env.EVIDENCE_SIGNING_KEY = KEY.priv;
        const res = await request(app).get('/api/evidence/pack?userId=demo-moderate');
        expect(res.status).toBe(200);
        expect(res.body.pack.manifest.meta.dataSource).toBe('synthetic-demo');
        expect(JSON.parse(res.body.files['scorecard.json']).scoring).toBeNull();           // nothing seeded in this test: no grade is invented
    });
});
