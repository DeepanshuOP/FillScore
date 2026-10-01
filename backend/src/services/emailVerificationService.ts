import crypto from 'crypto';
import { User } from '../models/User';
import { EmailVerificationToken } from '../models/EmailVerificationToken';
import { sendEmail } from './emailService';
import { env } from '../config/env';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (raw: string) => crypto.createHash('sha256').update(raw).digest('hex');

export async function sendVerificationEmail(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user || user.emailVerified) {
        return;
    }

    // Only the newest link should work
    await EmailVerificationToken.updateMany(
        { userId: user._id, usedAt: null },
        { $set: { usedAt: new Date() } }
    );

    const rawToken = crypto.randomBytes(32).toString('hex');
    await EmailVerificationToken.create({
        userId: user._id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    const link = `${env.FRONTEND_URL}/verify-email?token=${rawToken}`;
    const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 32px 20px;">
  <div style="font-size: 20px; font-weight: bold; letter-spacing: -0.5px; margin-bottom: 24px; color: #111111;">FillScore</div>
  <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 16px; color: #111111;">Verify your email</h1>
  <p style="font-size: 15px; line-height: 24px; margin-bottom: 24px; color: #4a4a4a;">
    Confirm this address to finish setting up your FillScore account:
  </p>
  <div style="margin-bottom: 24px;">
    <a href="${link}" style="display: inline-block; background-color: #111111; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 4px;">
      Verify email
    </a>
  </div>
  <p style="font-size: 13px; line-height: 20px; margin-bottom: 24px; color: #6a6a6a;">
    If the button doesn't work, copy and paste this link into your browser:<br>
    <a href="${link}" style="color: #4a4a4a; word-break: break-all;">${link}</a>
  </p>
  <p style="font-size: 14px; line-height: 22px; margin-bottom: 24px; color: #4a4a4a;">This link expires in 24 hours.</p>
  <p style="font-size: 13px; line-height: 20px; color: #8a8a8a; border-top: 1px solid #eeeeee; padding-top: 20px; margin-top: 32px;">
    If you didn't create a FillScore account, you can ignore this email.
  </p>
</div>`.trim();

    const text = `FillScore\n\nVerify your email\n\nConfirm this address to finish setting up your FillScore account:\n\n${link}\n\nThis link expires in 24 hours.\n\nIf you didn't create a FillScore account, you can ignore this email.`;

    await sendEmail({ to: user.email, subject: 'Verify your FillScore email', html, text });
}

export async function verifyEmail(rawToken: string): Promise<void> {
    const claimed = await EmailVerificationToken.findOneAndUpdate(
        { tokenHash: hashToken(rawToken), usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true }
    );

    if (!claimed) {
        throw new Error('invalid_or_expired_token');
    }

    await User.updateOne({ _id: claimed.userId }, { $set: { emailVerified: true } });
}
