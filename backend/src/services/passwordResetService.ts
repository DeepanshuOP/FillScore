import crypto from 'crypto';
import { User } from '../models/User';
import { PasswordResetToken } from '../models/PasswordResetToken';
import { RefreshToken } from '../models/RefreshToken';
import { sendEmail } from './emailService';
import { env } from '../config/env';
import { hashPassword } from '../utils/password';

export async function requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        // Return normally without sending or throwing to prevent user enumeration
        return;
    }

    // Invalidate any prior unused reset tokens for this user
    await PasswordResetToken.updateMany(
        { userId: user._id, usedAt: null },
        { $set: { usedAt: new Date() } }
    );

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    await PasswordResetToken.create({
        userId: user._id,
        tokenHash,
        expiresAt
    });

    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${rawToken}`;
    await sendEmail({
        to: user.email,
        subject: 'Reset your FillScore password',
        html: `<p>You requested a password reset. Click <a href="${resetLink}">here</a> to reset your password. This link expires in 30 minutes.</p>`
    });
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
        throw new Error('weak_password');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const claimed = await PasswordResetToken.findOneAndUpdate(
        { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true }
    );

    if (!claimed) {
        throw new Error('invalid_or_expired_token');
    }

    const passwordHash = await hashPassword(newPassword);

    await User.updateOne({ _id: claimed.userId }, { $set: { passwordHash } });

    // Revoke all existing RefreshToken sessions for this user on every device
    await RefreshToken.updateMany(
        { userId: claimed.userId, status: { $ne: 'revoked' } },
        { $set: { status: 'revoked' } }
    );
}
