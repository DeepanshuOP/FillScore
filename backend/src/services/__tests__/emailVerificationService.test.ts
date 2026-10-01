import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import * as emailService from '../emailService';
import { sendVerificationEmail, verifyEmail } from '../emailVerificationService';
import { EmailVerificationToken } from '../../models/EmailVerificationToken';
import { User } from '../../models/User';
import { loadEnv } from '../../config/env';

loadEnv();

const tokenFromCall = (call: any[]): string => {
    const match = call[0].html.match(/verify-email\?token=([a-f0-9]{64})/);
    if (!match) throw new Error('no token in email');
    return match[1];
};

describe('emailVerificationService', () => {
    let sendEmailMock: any;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(async () => {
        sendEmailMock?.mockRestore();
        await User.deleteMany({});
        await EmailVerificationToken.deleteMany({});
    });

    const newUser = async (overrides: Record<string, unknown> = {}) =>
        User.create({ email: 'new@verify.local', passwordHash: 'x', ...overrides });

    it('emails a link whose token is stored only as a hash and expires in 24h', async () => {
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
        const user = await newUser();

        await sendVerificationEmail(user._id.toString());

        expect(sendEmailMock).toHaveBeenCalledTimes(1);
        expect(sendEmailMock.mock.calls[0][0].to).toBe('new@verify.local');
        const raw = tokenFromCall(sendEmailMock.mock.calls[0]);
        const doc = await EmailVerificationToken.findOne({});
        expect(doc?.tokenHash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
        const ttl = doc!.expiresAt.getTime() - Date.now();
        expect(ttl).toBeGreaterThan(23.9 * 3600_000);
        expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
    });

    it('invalidates earlier unused tokens when a new one is issued', async () => {
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
        const user = await newUser();
        await sendVerificationEmail(user._id.toString());
        await sendVerificationEmail(user._id.toString());

        const first = tokenFromCall(sendEmailMock.mock.calls[0]);
        const second = tokenFromCall(sendEmailMock.mock.calls[1]);
        await expect(verifyEmail(first)).rejects.toThrow('invalid_or_expired_token');
        await expect(verifyEmail(second)).resolves.toBeUndefined();
    });

    it('marks the user verified and cannot be replayed', async () => {
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
        const user = await newUser();
        await sendVerificationEmail(user._id.toString());
        const raw = tokenFromCall(sendEmailMock.mock.calls[0]);

        await verifyEmail(raw);
        expect((await User.findById(user._id))?.emailVerified).toBe(true);
        await expect(verifyEmail(raw)).rejects.toThrow('invalid_or_expired_token');
    });

    it('rejects expired and unknown tokens', async () => {
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
        const user = await newUser();
        await sendVerificationEmail(user._id.toString());
        const raw = tokenFromCall(sendEmailMock.mock.calls[0]);
        await EmailVerificationToken.updateOne({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

        await expect(verifyEmail(raw)).rejects.toThrow('invalid_or_expired_token');
        await expect(verifyEmail('0'.repeat(64))).rejects.toThrow('invalid_or_expired_token');
        expect((await User.findById(user._id))?.emailVerified).toBe(false);
    });

    it('does not email a user who is already verified', async () => {
        sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
        const user = await newUser({ emailVerified: true });
        await sendVerificationEmail(user._id.toString());
        expect(sendEmailMock).not.toHaveBeenCalled();
        expect(await EmailVerificationToken.countDocuments({})).toBe(0);
    });
});
