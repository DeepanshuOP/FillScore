import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createOAuthCode, redeemOAuthCode, OAUTH_CODE_TTL_MS } from '../oauthCodeService';
import { OAuthCode } from '../../models/OAuthCode';
import { verifyAccessToken } from '../../utils/jwt';
import { loadEnv } from '../../config/env';

loadEnv();

describe('oauthCodeService', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(async () => {
        vi.useRealTimers();
        await OAuthCode.deleteMany({});
    });

    it('issues an unguessable code and stores only its hash', async () => {
        const code = await createOAuthCode('user-1');
        expect(code).toMatch(/^[a-f0-9]{64}$/);

        const docs = await OAuthCode.find({});
        expect(docs).toHaveLength(1);
        expect(docs[0].codeHash).toBe(crypto.createHash('sha256').update(code).digest('hex'));
        expect(JSON.stringify(docs[0].toObject())).not.toContain(code);
    });

    it('redeems a code into an access token for the right user', async () => {
        const code = await createOAuthCode('user-42');
        const { accessToken, userId } = await redeemOAuthCode(code);
        expect(userId).toBe('user-42');
        expect(verifyAccessToken(accessToken).userId).toBe('user-42');
    });

    it('is single use, even under concurrent redemption', async () => {
        const code = await createOAuthCode('user-7');
        const results = await Promise.allSettled([
            redeemOAuthCode(code),
            redeemOAuthCode(code),
            redeemOAuthCode(code),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        expect(rejected).toHaveLength(2);
        expect(rejected.every(r => r.reason.message === 'invalid_or_expired_code')).toBe(true);
    });

    it('rejects an unknown code', async () => {
        await expect(redeemOAuthCode('f'.repeat(64))).rejects.toThrow('invalid_or_expired_code');
    });

    it('rejects a code after its 30 second lifetime', async () => {
        expect(OAUTH_CODE_TTL_MS).toBe(30_000);
        const code = await createOAuthCode('user-9');
        await OAuthCode.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1) } });
        await expect(redeemOAuthCode(code)).rejects.toThrow('invalid_or_expired_code');
    });
});
