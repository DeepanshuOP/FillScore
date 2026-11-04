/**
 * F-13: the Privacy/Terms copy promises disconnect, deletion and a copy of the data.
 *  - DELETE /api/onboarding/connections/:exchange removes that stored (encrypted) key.
 *  - GET    /api/account/export returns trades, audits, history and notes — never keys or hashes.
 *  - DELETE /api/account needs the password (or, for a password-less OAuth account, a login in
 *    the last 5 minutes) and leaves no document referencing the account in any backend collection.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { AuditHistory } from '../../models/AuditHistory';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { OAuthCode } from '../../models/OAuthCode';
import { PasswordResetToken } from '../../models/PasswordResetToken';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { encryptApiKey } from '../../utils/encryption';

const app = createApp();
const PASSWORD = 'Password123!';
const RAW_KEY = 'K'.repeat(64);

async function seedAccount(id: string) {
    const base = {
        userId: id, accountId: id, dataSource: 'real-user', exchange: 'binance', orderId: 'o', symbol: 'BTCUSDT',
        side: 'BUY', orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 50000, notional: 50000,
        fee: 10, feeAsset: 'USDT', feeUsd: 10, executedAt: new Date('2026-10-30T10:00:00Z'), fillScore: 73.75, fillGrade: 'C',
    };
    await Trade.create([{ ...base, tradeId: `${id}-t1`, note: 'chased the pump' }, { ...base, tradeId: `${id}-t2` }]);
    await ExchangeConnection.create({ accountId: id, userId: id, exchange: 'binance', encryptedApiKey: encryptApiKey(RAW_KEY), encryptedApiSecret: encryptApiKey(RAW_KEY) });
    await ExchangeConnection.create({ accountId: id, userId: id, exchange: 'bybit', encryptedApiKey: encryptApiKey(RAW_KEY), encryptedApiSecret: encryptApiKey(RAW_KEY) });
    await Audit.create({
        userId: id, accountId: id, dataSource: 'real-user', period: { start: new Date(), end: new Date() }, exchange: 'binance',
        totalTrades: 2, totalNotional: 100000, avgFillScore: 73.75, fillGrade: 'C', estimatedLossUSD: 0,
        breakdown: { avgSlippageBps: 0, avgFeeDragBps: 2, makerRatio: 0, bestHour: 10, worstHour: 10, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
    });
    await AuditHistory.create({ accountId: id, dataSource: 'real-user', scoringVersion: '1.0.0', avgFillScore: 73.75, fillGrade: 'C', totalTrades: 2, snapshotAt: new Date() });
    await OAuthCode.create({ codeHash: crypto.randomBytes(32).toString('hex'), userId: id, expiresAt: new Date(Date.now() + 30000) });
    await PasswordResetToken.create({ userId: new mongoose.Types.ObjectId(id), tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) });
}

/** Every document in every collection of the backend database that references the account. */
async function leftovers(id: string) {
    const oid = new mongoose.Types.ObjectId(id);
    const found: Record<string, number> = {};
    for (const c of await mongoose.connection.db!.listCollections().toArray()) {
        const n = await mongoose.connection.db!.collection(c.name).countDocuments({
            $or: [{ _id: oid }, { _id: id as any }, { accountId: id }, { userId: id }, { userId: oid }],
        });
        if (n > 0) found[c.name] = n;
    }
    return found;
}

describe('F-13 account rights', () => {
    let token: string;
    let id: string;
    let otherId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const reg = await request(app).post('/api/auth/register').send({ email: 'rights@example.com', password: PASSWORD });
        token = reg.body.accessToken;
        id = reg.body.userId;
        await seedAccount(id);

        const other = await request(app).post('/api/auth/register').send({ email: 'bystander@example.com', password: PASSWORD });
        otherId = other.body.userId;
        await seedAccount(otherId);
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });

    describe('DELETE /api/onboarding/connections/:exchange', () => {
        it('requires auth', async () => {
            expect((await request(app).delete('/api/onboarding/connections/binance')).status).toBe(401);
        });

        it('rejects an unknown exchange with 400', async () => {
            const res = await request(app).delete('/api/onboarding/connections/kraken').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(400);
        });

        it('removes only that exchange key for only this account, and keeps the trades', async () => {
            const res = await request(app).delete('/api/onboarding/connections/binance').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, exchange: 'binance' });
            expect(await ExchangeConnection.countDocuments({ accountId: id, exchange: 'binance' })).toBe(0);
            expect(await ExchangeConnection.countDocuments({ accountId: id, exchange: 'bybit' })).toBe(1);
            expect(await ExchangeConnection.countDocuments({ accountId: otherId, exchange: 'binance' })).toBe(1);
            expect(await Trade.countDocuments({ accountId: id })).toBe(2);
        });

        it('answers 404 when there is nothing to disconnect', async () => {
            const res = await request(app).delete('/api/onboarding/connections/binance').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(404);
        });
    });

    describe('GET /api/account/export', () => {
        it('requires auth', async () => {
            expect((await request(app).get('/api/account/export')).status).toBe(401);
        });

        it('returns trades, audits, history and notes as a JSON attachment, never keys', async () => {
            const res = await request(app).get('/api/account/export').set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.headers['content-disposition']).toContain('attachment');
            const body = JSON.parse(res.text);
            expect(body.account.email).toBe('rights@example.com');
            expect(body.trades).toHaveLength(2);
            expect(body.trades.every((t: any) => t.accountId === id)).toBe(true);
            expect(body.audits).toHaveLength(1);
            expect(body.history).toHaveLength(1);
            expect(body.notes).toEqual([{ tradeId: `${id}-t1`, note: 'chased the pump' }]);
            expect(body.connections).toEqual([{ exchange: 'bybit', connectedAt: expect.any(String) }]);

            const conn = await ExchangeConnection.findOne({ accountId: id }).lean();
            for (const secret of ['encrypted', 'passwordHash', 'tokenHash', conn!.encryptedApiKey.encrypted, conn!.encryptedApiKey.iv, RAW_KEY]) {
                expect(res.text).not.toContain(secret);
            }
            expect(res.text).not.toContain(otherId);
        });
    });

    describe('DELETE /api/account', () => {
        it('requires auth', async () => {
            expect((await request(app).delete('/api/account')).status).toBe(401);
        });

        it('refuses a wrong password and deletes nothing', async () => {
            const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${token}`).send({ password: 'nope' });
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('reauth_required');
            expect(await User.countDocuments({ _id: id })).toBe(1);
        });

        it('refuses a password account with no password even on a fresh login', async () => {
            const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${token}`).send({});
            expect(res.status).toBe(401);
            expect(await Trade.countDocuments({ accountId: id })).toBe(2);
        });

        it('with the password, removes every document that references the account and nothing else', async () => {
            const before = await leftovers(id);
            expect(Object.keys(before).sort()).toEqual(
                ['audithistories', 'audits', 'emailverificationtokens', 'exchangeconnections', 'oauthcodes', 'passwordresettokens', 'refreshtokens', 'trades', 'users'].filter(n => n in before).sort());
            expect(before.users).toBe(1);

            const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${token}`).send({ password: PASSWORD });
            expect(res.status).toBe(200);
            expect(res.body.deleted).toBe(true);

            expect(await leftovers(id)).toEqual({});
            // an access token issued before deletion cannot recreate data for the deleted account
            const connect = await request(app).post('/api/onboarding/connect').set('Authorization', `Bearer ${token}`)
                .send({ exchange: 'binance', apiKey: 'k'.repeat(64), apiSecret: 's'.repeat(64) });
            expect(connect.status).toBe(401);
            const sync = await request(app).post('/api/onboarding/sync').set('Authorization', `Bearer ${token}`);
            expect(sync.status).toBe(401);
            expect(await leftovers(id)).toEqual({});

            // the bystander is untouched
            expect(await Trade.countDocuments({ accountId: otherId })).toBe(2);
            expect(await User.countDocuments({ _id: otherId })).toBe(1);
        });
    });

    describe('DELETE /api/account for a password-less (OAuth) account', () => {
        let oauthId: string;
        beforeAll(async () => {
            const u = await User.create({ email: 'oauth-only@example.com', emailVerified: true, authProviders: [{ provider: 'github', providerId: '42' }] });
            oauthId = u._id.toString();
            await seedAccount(oauthId);
        });

        it('refuses when the login is older than 5 minutes', async () => {
            const stale = jwt.sign({ userId: oauthId, typ: 'access', auth_time: Math.floor(Date.now() / 1000) - 600 },
                process.env.JWT_ACCESS_SECRET!, { algorithm: 'HS256', expiresIn: 900 });
            const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${stale}`).send({});
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('reauth_required');
            expect(await User.countDocuments({ _id: oauthId })).toBe(1);
        });

        it('accepts a login from the last 5 minutes and leaves nothing behind', async () => {
            const { accessToken } = await issueTokenPair(oauthId);
            const res = await request(app).delete('/api/account').set('Authorization', `Bearer ${accessToken}`).send({});
            expect(res.status).toBe(200);
            expect(await leftovers(oauthId)).toEqual({});
        });
    });
});
