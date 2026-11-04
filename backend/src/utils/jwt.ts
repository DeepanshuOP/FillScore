import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ACCESS_EXPIRES_IN = 900; // 15 minutes (in seconds)

// F-27: every token is HS256 and says what it is, so an access token can never be replayed as a
// refresh token (or the reverse) even if the two secrets were ever set to the same value.
const ALGORITHM = 'HS256' as const;
type TokenType = 'access' | 'refresh';

function verifyTyped(token: string, secret: string, typ: TokenType): any {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] }) as any;
    if (!payload || payload.typ !== typ) {
        throw new jwt.JsonWebTokenError(`invalid token type: expected ${typ}`);
    }
    return payload;
}

export function signAccessToken(payload: any): string {
    return jwt.sign({ ...payload, typ: 'access' }, env.JWT_ACCESS_SECRET, { algorithm: ALGORITHM, expiresIn: ACCESS_EXPIRES_IN });
}

export function signRefreshToken(payload: any): string {
    return jwt.sign({ ...payload, typ: 'refresh' }, env.JWT_REFRESH_SECRET, { algorithm: ALGORITHM, expiresIn: '7d' });
}

export function verifyAccessToken(token: string): any {
    return verifyTyped(token, env.JWT_ACCESS_SECRET, 'access');
}

export function verifyRefreshToken(token: string): any {
    return verifyTyped(token, env.JWT_REFRESH_SECRET, 'refresh');
}
