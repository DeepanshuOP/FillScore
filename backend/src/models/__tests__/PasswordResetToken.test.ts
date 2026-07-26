import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { PasswordResetToken } from '../PasswordResetToken';
import { User } from '../User';
import crypto from 'crypto';

describe('PasswordResetToken Model', () => {
    let testUserId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
        
        await User.deleteMany({ email: 'test_pwd_reset@fillscore-test.local' });
        await PasswordResetToken.deleteMany({});

        const user = new User({ email: 'test_pwd_reset@fillscore-test.local', passwordHash: 'dummy' });
        const saved = await user.save();
        testUserId = saved._id as mongoose.Types.ObjectId;
    });

    afterAll(async () => {
        await User.deleteMany({ email: 'test_pwd_reset@fillscore-test.local' });
        await PasswordResetToken.deleteMany({});
    });

    afterEach(async () => {
        await PasswordResetToken.deleteMany({});
    });

    it('raw token is not findable in the stored doc; lookup by hash works', async () => {
        const rawToken = 'raw-reset-token-secret-value';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

        const doc = new PasswordResetToken({
            userId: testUserId,
            tokenHash,
            expiresAt
        });

        const saved = await doc.save();

        // Raw token is not stored
        expect(saved.tokenHash).toBe(tokenHash);
        expect(saved.tokenHash).not.toBe(rawToken);
        expect(JSON.stringify(saved.toJSON())).not.toContain(rawToken);

        // Lookup by hash works
        const found = await PasswordResetToken.findOne({ tokenHash });
        expect(found).toBeDefined();
        expect(found?.userId.toString()).toBe(testUserId.toString());
        expect(found?.usedAt).toBeNull();
    });

    it('an expired or already-used token is identifiable', async () => {
        const usedTokenHash = crypto.createHash('sha256').update('used-token').digest('hex');
        const expiredTokenHash = crypto.createHash('sha256').update('expired-token').digest('hex');
        const usedAt = new Date();
        const expiredDate = new Date(Date.now() - 1000 * 60 * 60);

        const usedDoc = new PasswordResetToken({
            userId: testUserId,
            tokenHash: usedTokenHash,
            expiresAt: new Date(Date.now() + 100000),
            usedAt
        });
        await usedDoc.save();

        const expiredDoc = new PasswordResetToken({
            userId: testUserId,
            tokenHash: expiredTokenHash,
            expiresAt: expiredDate
        });
        await expiredDoc.save();

        const foundUsed = await PasswordResetToken.findOne({ tokenHash: usedTokenHash });
        expect(foundUsed).toBeDefined();
        expect(foundUsed?.usedAt).toEqual(usedAt);
        expect(foundUsed?.usedAt).not.toBeNull();

        const foundExpired = await PasswordResetToken.findOne({ tokenHash: expiredTokenHash });
        expect(foundExpired).toBeDefined();
        expect(foundExpired?.expiresAt.getTime()).toBeLessThan(Date.now());
    });
});
