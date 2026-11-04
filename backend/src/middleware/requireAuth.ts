import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

// Extend Express Request to include userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            /** Seconds since epoch of the login that started this token chain (F-13). */
            authTime?: number;
            accountId?: string;
            isDemo?: boolean;
        }
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = verifyAccessToken(token);
        req.userId = payload.userId;
        req.authTime = typeof payload.auth_time === 'number' ? payload.auth_time : undefined;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired access token' });
    }
}
