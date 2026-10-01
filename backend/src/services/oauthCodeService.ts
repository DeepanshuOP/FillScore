import crypto from 'crypto';
import { OAuthCode } from '../models/OAuthCode';
import { signAccessToken } from '../utils/jwt';

export const OAUTH_CODE_TTL_MS = 30_000;

const hashCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

/** Issues a short-lived, single-use code the frontend swaps for an access token. */
export async function createOAuthCode(userId: string): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');
    await OAuthCode.create({
        codeHash: hashCode(code),
        userId,
        expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
    });
    return code;
}

/**
 * Redeems a code. The delete is atomic, so concurrent redemptions of the same
 * code cannot both succeed.
 */
export async function redeemOAuthCode(code: string): Promise<{ accessToken: string; userId: string }> {
    const doc = await OAuthCode.findOneAndDelete({
        codeHash: hashCode(code),
        expiresAt: { $gt: new Date() },
    });
    if (!doc) {
        throw new Error('invalid_or_expired_code');
    }
    return { accessToken: signAccessToken({ userId: doc.userId }), userId: doc.userId };
}
