import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const ACCESS_EXPIRES_IN = 900; // 15 minutes (in seconds)

export function signAccessToken(payload: any): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

export function signRefreshToken(payload: any): string {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): any {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token: string): any {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
