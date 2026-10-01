import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type DownloadKind = 'report' | 'export';

export const DOWNLOAD_TOKEN_TTL_SECONDS = 60;

/**
 * Browsers cannot attach an Authorization header to window.open, so a signed-in user asks for a
 * one-minute link token and opens the file with it. The key is derived from the access secret
 * but is not the same key, so a download token is useless as an access token and the reverse.
 */
export function downloadSigningKey(): Buffer {
    return crypto.createHash('sha256').update(`fillscore-download:${env.JWT_ACCESS_SECRET}`).digest();
}

export function signDownloadToken(userId: string, kind: DownloadKind): string {
    return jwt.sign({ userId, kind }, downloadSigningKey(), { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS });
}

export function verifyDownloadToken(token: string, kind: DownloadKind): { userId: string } {
    const payload = jwt.verify(token, downloadSigningKey(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.kind !== kind || typeof payload.userId !== 'string' || payload.userId === '') {
        throw new Error('invalid_download_token');
    }
    return { userId: payload.userId };
}
