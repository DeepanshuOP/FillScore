import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

// Extend Express Request to include userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
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
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired access token' });
    }
}
