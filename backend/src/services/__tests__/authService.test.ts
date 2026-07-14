import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { register, login, rotateRefresh, logout } from '../authService';
import { loadEnv } from '../../config/env';
import crypto from 'crypto';

loadEnv(); // ensure JWT secrets are loaded

describe('authService', () => {
    // Hand-computed values are ground truth; fix the code, not the test.
    let testUserId: string;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        await User.deleteMany({});
        await RefreshToken.deleteMany({});
    });

    afterEach(async () => {
        await User.deleteMany({});
        await RefreshToken.deleteMany({});
    });

    afterAll(async () => {
        // Cleanup handled by global
    });

    describe('register', () => {
        it('rejects weak/empty password', async () => {
            await expect(register('test@test.local', '123')).rejects.toThrow('Password must be at least 8 characters');
            await expect(register('test@test.local', '')).rejects.toThrow('Password is required');
        });

        it('stores only passwordHash (never plaintext) and returns token pair', async () => {
            const result = await register('newuser@test.local', 'StrongPass123!');
            expect(result).toHaveProperty('userId');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');

            testUserId = result.userId;

            const userDoc = await User.findById(testUserId);
            expect(userDoc).toBeDefined();
            expect(userDoc?.email).toBe('newuser@test.local');
            expect((userDoc as any).password).toBeUndefined(); // never store plaintext
            expect(userDoc?.passwordHash).toBeDefined();

            // Check refresh token was stored
            const tokenHash = crypto.createHash('sha256').update(result.refreshToken).digest('hex');
            const tokenDoc = await RefreshToken.findOne({ tokenHash });
            expect(tokenDoc).toBeDefined();
            expect(tokenDoc?.userId.toString()).toBe(testUserId.toString());
        });

        it('rejects duplicate email', async () => {
            await register('dup@test.local', 'StrongPass123!');
            await expect(register('dup@test.local', 'AnotherPass!123')).rejects.toThrow('Email already exists');
        });
    });

    describe('login', () => {
        it('correct credentials return a token pair', async () => {
            await register('login@test.local', 'ValidPass!23');
            const result = await login('login@test.local', 'ValidPass!23');
            expect(result).toHaveProperty('userId');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
        });

        it('wrong password returns an auth failure (not a 500)', async () => {
            await register('wrongpass@test.local', 'ValidPass!23');
            await expect(login('wrongpass@test.local', 'InvalidPass!')).rejects.toThrow('Invalid email or password');
        });

        it('non-existent email fails the same way (no user-enumeration difference)', async () => {
            await expect(login('nobody@test.local', 'AnyPass!123')).rejects.toThrow('Invalid email or password');
        });
    });

    describe('rotateRefresh and logout', () => {
        it('on valid use: marks old token revoked, issues new pair in same family', async () => {
            const { refreshToken: rawToken1 } = await register('rotate@test.local', 'Pass!123456');

            const tokenHash1 = crypto.createHash('sha256').update(rawToken1).digest('hex');
            const tokenDoc1 = await RefreshToken.findOne({ tokenHash: tokenHash1 });
            expect(tokenDoc1).toBeDefined();
            expect(tokenDoc1?.status).toBe('active');
            const familyId = tokenDoc1?.family;

            const result = await rotateRefresh(rawToken1);
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');

            const newRawToken = result.refreshToken;
            expect(newRawToken).not.toBe(rawToken1);

            // Old token should be revoked
            const updatedToken1 = await RefreshToken.findOne({ tokenHash: tokenHash1 });
            expect(updatedToken1?.status).toBe('rotated');

            // New token should be active and in same family
            const newHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
            const updatedToken2 = await RefreshToken.findOne({ tokenHash: newHash });
            expect(updatedToken2).toBeDefined();
            expect(updatedToken2?.status).toBe('active');
            expect(updatedToken2?.family).toBe(familyId);
        });

        it('CRITICAL reuse detection: presenting an already-revoked token revokes the ENTIRE family and rejects', async () => {
            const { refreshToken: rawToken1 } = await register('reuse@test.local', 'Pass!123456');

            // Legitimate rotation 1 -> gives us rawToken2
            const result1 = await rotateRefresh(rawToken1);
            const rawToken2 = result1.refreshToken;

            // Legitimate rotation 2 -> gives us rawToken3
            const result2 = await rotateRefresh(rawToken2);
            const rawToken3 = result2.refreshToken;

            // Now malicious actor tries to use the compromised OLD token (rawToken1)
            await expect(rotateRefresh(rawToken1)).rejects.toThrow('reuse_detected');

            // This should revoke the ENTIRE family, meaning rawToken3 is now dead too.
            const hash3 = crypto.createHash('sha256').update(rawToken3).digest('hex');
            const tokenDoc3 = await RefreshToken.findOne({ tokenHash: hash3 });
            expect(tokenDoc3?.status).toBe('revoked'); // Killed!

            // Trying to use rawToken3 should fail
            await expect(rotateRefresh(rawToken3)).rejects.toThrow('token_revoked');
        });

        it('Re-presenting a revoked-by-logout token does not trigger reuse detection', async () => {
            const { refreshToken: rawToken } = await register('revoked@test.local', 'Pass!123456');
            
            // Logout kills the token (status: 'revoked')
            await logout(rawToken);

            // Re-presenting it should simply be rejected as token_revoked, not reuse_detected
            await expect(rotateRefresh(rawToken)).rejects.toThrow('token_revoked');
        });

        it('logout revokes the token/family idompotently', async () => {
            const { refreshToken: rawToken } = await register('logout@test.local', 'Pass!123456');

            await logout(rawToken);

            const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const tokenDoc = await RefreshToken.findOne({ tokenHash: hash });
            expect(tokenDoc?.status).toBe('revoked');

            // idempotent
            await expect(logout(rawToken)).resolves.not.toThrow();
        });
    });
});
