import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

declare global {
    namespace Express {
        interface Request {
            accountId?: string;
            isDemo?: boolean;
        }
    }
}

// The six known demo users: demo-disciplined, demo-moderate, demo-aggressive, demo-bybit, demo-okx, demo-multi.
// We use an explicit anchored set rather than a loose prefix match (like `startsWith('demo-')`)
// to strictly prevent parameter injection, path traversal (e.g. 'demo-../admin'), or loose matching bugs.
export const VALID_DEMO_USERS = new Set([
    'demo-disciplined',
    'demo-moderate',
    'demo-aggressive',
    'demo-bybit',
    'demo-okx',
    'demo-multi'
]);

export const resolveAccount = (req: Request, res: Response, next: NextFunction): void => {
    // Extract requested user from query, params, or body
    const requestedUserId = req.query.userId || req.params.userId || req.body?.userId;

    if (requestedUserId) {
        if (typeof requestedUserId === 'string' && VALID_DEMO_USERS.has(requestedUserId)) {
            // Rule 1 & 2: Valid demo slug requested - resolves accountId to slug and isDemo to true
            req.accountId = requestedUserId;
            req.isDemo = true;
            return next();
        } else {
            // Rule 5 & 6: NON-demo userId or malicious demo-ish string requested -> 403 Forbidden
            res.status(403).json({ error: 'Forbidden: Invalid userId or unauthorized access' });
            return;
        }
    }

    // Rule 3 & 4: NO explicit userId parameter provided -> must authenticate via token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = verifyAccessToken(token);
        req.accountId = payload.userId;
        req.isDemo = false;
        return next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired access token' });
        return;
    }
};
