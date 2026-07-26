import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { requestPasswordReset, resetPassword } from '../passwordResetService';
import { User } from '../../models/User';
import { PasswordResetToken } from '../../models/PasswordResetToken';
import { RefreshToken } from '../../models/RefreshToken';
import * as emailService from '../emailService';
import { hashPassword, verifyPassword } from '../../utils/password';
import crypto from 'crypto';

describe('passwordResetService', () => {
    let testUser: any;
    let sendEmailMock: any;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        await User.deleteMany({});
        await PasswordResetToken.deleteMany({});
        await RefreshToken.deleteMany({});
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);

        await User.deleteMany({});
        await PasswordResetToken.deleteMany({});
        await RefreshToken.deleteMany({});

        const passwordHash = await hashPassword('OldStrongPass123!');
        testUser = await User.create({
            email: 'reset_test@fillscore-test.local',
            passwordHash
        });
    });

    function extractTokenFromEmail(mockCall: any): string {
        const html = mockCall[0].html;
        const match = html.match(/token=([a-f0-9]{64})/);
        if (!match) throw new Error('Token not found in email html: ' + html);
        return match[1];
    }

    it('1. unknown email -> resolves, no email sent, no token created (no enumeration)', async () => {
        await expect(requestPasswordReset('nobody@fillscore-test.local')).resolves.toBeUndefined();
        expect(sendEmailMock).not.toHaveBeenCalled();
        const tokens = await PasswordResetToken.find({});
        expect(tokens.length).toBe(0);
    });

    it('2. known email -> token created, email sent exactly once, stored doc contains only the hash', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        expect(sendEmailMock).toHaveBeenCalledTimes(1);

        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);
        const tokens = await PasswordResetToken.find({});
        expect(tokens.length).toBe(1);

        const stored = tokens[0];
        expect(stored.tokenHash).not.toBe(rawToken);
        expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    });

    it('3. requesting twice invalidates the first token (first raw token no longer works)', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        const firstRawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await requestPasswordReset('reset_test@fillscore-test.local');
        
        await expect(resetPassword(firstRawToken, 'NewStrongPass123!')).rejects.toThrow('invalid_or_expired_token');
    });

    it('4. valid token + strong password -> password changed (verifyPassword succeeds with new, fails with old)', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await resetPassword(rawToken, 'NewStrongPass123!');

        const updatedUser = await User.findById(testUser._id);
        expect(updatedUser).toBeDefined();
        await expect(verifyPassword('NewStrongPass123!', updatedUser!.passwordHash!)).resolves.toBe(true);
        await expect(verifyPassword('OldStrongPass123!', updatedUser!.passwordHash!)).resolves.toBe(false);
    });

    it('5. valid token used twice -> second attempt throws invalid_or_expired_token', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await resetPassword(rawToken, 'NewStrongPass123!');
        await expect(resetPassword(rawToken, 'AnotherPass123!')).rejects.toThrow('invalid_or_expired_token');
    });

    it('6. expired token -> throws invalid_or_expired_token', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        // Manually expire the token in the DB
        const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
        await PasswordResetToken.updateOne({ tokenHash: hash }, { $set: { expiresAt: new Date(Date.now() - 10000) } });

        await expect(resetPassword(rawToken, 'NewStrongPass123!')).rejects.toThrow('invalid_or_expired_token');
    });

    it('7. garbage token -> throws invalid_or_expired_token', async () => {
        await expect(resetPassword('garbage-token-value-not-real', 'NewStrongPass123!')).rejects.toThrow('invalid_or_expired_token');
    });

    it('8. weak password (<8) -> throws weak_password, password NOT changed, token NOT consumed', async () => {
        await requestPasswordReset('reset_test@fillscore-test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await expect(resetPassword(rawToken, 'short')).rejects.toThrow('weak_password');

        // Verify password NOT changed
        const unchangedUser = await User.findById(testUser._id);
        await expect(verifyPassword('OldStrongPass123!', unchangedUser!.passwordHash!)).resolves.toBe(true);

        // Verify token NOT consumed (can still be used with a strong password)
        const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const doc = await PasswordResetToken.findOne({ tokenHash: hash });
        expect(doc?.usedAt).toBeNull();
    });

    it('9. AFTER a successful reset, every RefreshToken for that user has status revoked', async () => {
        // Create active refresh tokens for the user
        await RefreshToken.create({
            userId: testUser._id,
            tokenHash: 'hash1',
            family: 'fam1',
            status: 'active',
            expiresAt: new Date(Date.now() + 100000)
        });
        await RefreshToken.create({
            userId: testUser._id,
            tokenHash: 'hash2',
            family: 'fam2',
            status: 'active',
            expiresAt: new Date(Date.now() + 100000)
        });

        await requestPasswordReset('reset_test@fillscore-test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await resetPassword(rawToken, 'NewStrongPass123!');

        const tokens = await RefreshToken.find({ userId: testUser._id });
        expect(tokens.length).toBe(2);
        for (const t of tokens) {
            expect(t.status).toBe('revoked');
        }
    });

    it('10. two concurrent resetPassword calls with the same valid token -> exactly ONE succeeds, the other throws invalid_or_expired_token', async () => {
        await User.create({ email: 'toctou@test.local', passwordHash: 'oldhash' });

        await requestPasswordReset('toctou@test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        const results = await Promise.allSettled([
            resetPassword(rawToken, 'NewStrongPassword1!'),
            resetPassword(rawToken, 'NewStrongPassword1!')
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        expect((rejected[0] as PromiseRejectedResult).reason.message).toBe('invalid_or_expired_token');
    });

    it('11. OAuth-only user can set a password via reset, can subsequently log in with it, and their authProviders entry is preserved', async () => {
        const oauthUser = await User.create({
            email: 'oauth_user@test.local',
            authProviders: [{ provider: 'google', providerId: 'google-123' }]
        });
        expect(oauthUser.passwordHash).toBeUndefined();

        await requestPasswordReset('oauth_user@test.local');
        const rawToken = extractTokenFromEmail(sendEmailMock.mock.calls[0]);

        await resetPassword(rawToken, 'OauthNewStrongPassword1!');

        const updatedUser = await User.findOne({ email: 'oauth_user@test.local' });
        expect(updatedUser?.passwordHash).toBeDefined();
        expect(updatedUser?.authProviders?.length).toBe(1);
        expect(updatedUser?.authProviders?.[0].provider).toBe('google');
        expect(updatedUser?.authProviders?.[0].providerId).toBe('google-123');

        const isValidPassword = await verifyPassword('OauthNewStrongPassword1!', updatedUser!.passwordHash!);
        expect(isValidPassword).toBe(true);
    });
});
