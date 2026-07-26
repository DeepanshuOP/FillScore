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
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 32px 20px;">
  <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px; margin-bottom: 24px; color: #111111;">FillScore</div>
  <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #111111;">Reset your password</h1>
  <p style="font-size: 15px; line-height: 24px; margin-bottom: 24px; color: #4a4a4a;">
    We received a request to reset the password for your FillScore account. Click the button below to choose a new password:
  </p>
  <div style="margin-bottom: 24px;">
    <a href="${resetLink}" style="display: inline-block; background-color: #111111; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 4px;">
      Reset Password
    </a>
  </div>
  <p style="font-size: 13px; line-height: 20px; margin-bottom: 24px; color: #6a6a6a;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${resetLink}" style="color: #4a4a4a; word-break: break-all;">${resetLink}</a>
  </p>
  <p style="font-size: 14px; line-height: 22px; margin-bottom: 24px; color: #4a4a4a;">
    This link expires in 30 minutes.
  </p>
  <p style="font-size: 13px; line-height: 20px; color: #8a8a8a; border-top: 1px solid #eeeeee; padding-top: 20px; margin-top: 32px;">
    If you didn't request this, you can safely ignore this email — your password won't change.
  </p>
</div>`.trim();

    const text = `FillScore\n\nReset your password\n\nWe received a request to reset the password for your FillScore account. Use the link below to choose a new password:\n\n${resetLink}\n\nThis link expires in 30 minutes.\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`;

    await sendEmail({
        to: user.email,
        subject: 'Reset your FillScore password',
        html,
        text
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
