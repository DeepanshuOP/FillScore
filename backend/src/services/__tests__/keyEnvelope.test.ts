import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { encryptApiKey, decryptApiKey, isLegacyPayload } from '../../utils/encryption';
import { readConnectionSecrets } from '../keyEnvelope';
import { migrateKeyEnvelopes } from '../../scripts/migrateKeyEnvelope';
import { loadEnv } from '../../config/env';

loadEnv();

// Hand-computed: a connection made before the change holds three legacy blobs (key, secret, passphrase).
// readConnectionSecrets returns the plaintext and re-encrypts all three as version 2 (v = 2), bound to
// (accountId, exchange, field). A second read finds nothing legacy and writes nothing (the stored blobs stay byte-equal).
describe('re-encryption on next use', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterEach(async () => { await ExchangeConnection.deleteMany({}); });

    const legacy = (accountId = 'acct-1', exchange: 'binance' | 'okx' = 'okx') => ExchangeConnection.create({
        accountId, exchange,
        encryptedApiKey: encryptApiKey('the-key'), encryptedApiSecret: encryptApiKey('the-secret'),
        ...(exchange === 'okx' ? { encryptedPassphrase: encryptApiKey('the-pass') } : {}),
    });

    it('an old blob still reads, and is stored again as version 2', async () => {
        const conn = await legacy();
        expect(isLegacyPayload(conn.encryptedApiKey)).toBe(true);
        const s = await readConnectionSecrets(conn);
        expect(s).toMatchObject({ apiKey: 'the-key', apiSecret: 'the-secret', passphrase: 'the-pass', upgraded: true });
        const stored = (await ExchangeConnection.findById(conn._id).lean())!;
        expect(stored.encryptedApiKey.v).toBe(2);
        expect(stored.encryptedApiSecret.v).toBe(2);
        expect(stored.encryptedPassphrase!.v).toBe(2);
        expect(decryptApiKey(stored.encryptedApiKey, { userId: 'acct-1', exchange: 'okx', field: 'apiKey' })).toBe('the-key');
        expect(() => decryptApiKey(stored.encryptedApiKey, { userId: 'acct-2', exchange: 'okx', field: 'apiKey' })).toThrow();
    });

    it('a second read writes nothing', async () => {
        const conn = await legacy();
        await readConnectionSecrets(conn);
        const first = (await ExchangeConnection.findById(conn._id).lean())!;
        const again = await readConnectionSecrets((await ExchangeConnection.findById(conn._id))!);
        expect(again.upgraded).toBe(false);
        const second = (await ExchangeConnection.findById(conn._id).lean())!;
        expect(second.encryptedApiKey).toEqual(first.encryptedApiKey);
    });

    it('a version 2 blob moved to another account is not readable (the sync would fail closed)', async () => {
        const a = await legacy('acct-A', 'binance');
        await readConnectionSecrets(a);
        const stored = (await ExchangeConnection.findById(a._id).lean())!;
        const thief = await ExchangeConnection.create({ accountId: 'acct-B', exchange: 'binance', encryptedApiKey: stored.encryptedApiKey, encryptedApiSecret: stored.encryptedApiSecret });
        await expect(readConnectionSecrets(thief)).rejects.toThrow(/Failed to decrypt/);
    });
});

describe('migrateKeyEnvelopes', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterEach(async () => { await ExchangeConnection.deleteMany({}); });

    const mk = (accountId: string, exchange: 'binance' | 'bybit', ctxed: boolean) => ExchangeConnection.create({
        accountId, exchange,
        encryptedApiKey: ctxed ? encryptApiKey('k', { userId: accountId, exchange, field: 'apiKey' }) : encryptApiKey('k'),
        encryptedApiSecret: ctxed ? encryptApiKey('s', { userId: accountId, exchange, field: 'apiSecret' }) : encryptApiKey('s'),
    });

    it('is a dry run by default: it counts and writes nothing', async () => {
        await mk('a1', 'binance', false); await mk('a2', 'bybit', false); await mk('a3', 'binance', true);
        const before = JSON.stringify(await ExchangeConnection.find().sort({ accountId: 1 }).lean());
        const r = await migrateKeyEnvelopes({}, () => {});
        expect(r).toEqual({ total: 3, alreadyV2: 1, legacy: 2, upgraded: 0, failed: 0, applied: false });
        expect(JSON.stringify(await ExchangeConnection.find().sort({ accountId: 1 }).lean())).toBe(before);
    });

    it('with apply it upgrades the legacy ones only and a rerun finds none', async () => {
        await mk('a1', 'binance', false); await mk('a2', 'bybit', false); await mk('a3', 'binance', true);
        const r = await migrateKeyEnvelopes({ apply: true }, () => {});
        expect(r).toEqual({ total: 3, alreadyV2: 1, legacy: 2, upgraded: 2, failed: 0, applied: true });
        const again = await migrateKeyEnvelopes({}, () => {});
        expect(again).toMatchObject({ legacy: 0, alreadyV2: 3 });
    });

    it('a blob that cannot be decrypted is counted as failed and left untouched', async () => {
        const c = await mk('a1', 'binance', false);
        await ExchangeConnection.updateOne({ _id: c._id }, { $set: { 'encryptedApiKey.authTag': '00'.repeat(16) } });
        const r = await migrateKeyEnvelopes({ apply: true }, () => {});
        expect(r).toMatchObject({ legacy: 1, upgraded: 0, failed: 1 });
        expect((await ExchangeConnection.findById(c._id).lean())!.encryptedApiSecret.v).toBeUndefined();
    });

    it('prints counts only, never a value', async () => {
        await mk('secret-looking-account-id', 'binance', false);
        const lines: string[] = [];
        await migrateKeyEnvelopes({ apply: true }, m => lines.push(m));
        expect(lines.join('\n')).not.toMatch(/secret-looking-account-id|"k"|"s"/);
    });
});
