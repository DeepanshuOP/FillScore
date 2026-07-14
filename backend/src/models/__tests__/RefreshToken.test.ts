import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { RefreshToken } from '../RefreshToken';
import { User } from '../User';
import crypto from 'crypto';

describe('RefreshToken Model', () => {
    let testUserId: mongoose.Types.ObjectId;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
        
        await User.deleteMany({});
        await RefreshToken.deleteMany({});

        const user = new User({ email: 'test_refresh@fillscore-test.local', passwordHash: 'dummy' });
        const saved = await user.save();
        testUserId = saved._id as mongoose.Types.ObjectId;
    });

    afterAll(async () => {
        await User.deleteMany({ email: 'test_refresh@fillscore-test.local' });
    });

    afterEach(async () => {
        await RefreshToken.deleteMany({});
    });

    it('storing a token stores only its hash, never the raw value', async () => {
        const rawToken = 'raw-secret-token-string';
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const family = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

        const tokenDoc = new RefreshToken({
            userId: testUserId,
            tokenHash: tokenHash,
            family: family,
            expiresAt: expiresAt
        });

        const saved = await tokenDoc.save();

        // Ensure the raw token string is not anywhere in the doc
        expect(saved.tokenHash).toBe(tokenHash);
        expect(saved.tokenHash).not.toBe(rawToken);
        expect(JSON.stringify(saved.toJSON())).not.toContain(rawToken);

        // Verify default fields
        expect(saved.status).toBe('active');
        expect(saved.createdAt).toBeInstanceOf(Date);
        expect(saved.expiresAt).toEqual(expiresAt);
        expect(saved.family).toBe(family);
        expect(saved.userId.toString()).toBe(testUserId.toString());
    });

    it('lookup by hash works; an expired or revoked token is identifiable', async () => {
        const tokenHash1 = crypto.createHash('sha256').update('token1').digest('hex');
        const tokenHash2 = crypto.createHash('sha256').update('token2').digest('hex');
        
        // valid
        const token1 = new RefreshToken({
            userId: testUserId,
            tokenHash: tokenHash1,
            family: 'fam1',
            expiresAt: new Date(Date.now() + 100000)
        });
        await token1.save();

        // revoked
        const token2 = new RefreshToken({
            userId: testUserId,
            tokenHash: tokenHash2,
            family: 'fam2',
            expiresAt: new Date(Date.now() + 100000),
            status: 'revoked'
        });
        await token2.save();

        const found1 = await RefreshToken.findOne({ tokenHash: tokenHash1 });
        expect(found1).toBeDefined();
        expect(found1?.status).toBe('active');

        const found2 = await RefreshToken.findOne({ tokenHash: tokenHash2 });
        expect(found2).toBeDefined();
        expect(found2?.status).toBe('revoked');
    });
});
