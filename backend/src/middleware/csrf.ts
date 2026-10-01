import { Request, Response, NextFunction } from 'express';
import { env, parseAllowedOrigins } from '../config/env';

const normalise = (origin: string): string => origin.trim().replace(/\/+$/, '');

function originFromReferer(referer: string): string | null {
    try {
        return new URL(referer).origin;
    } catch {
        return null;
    }
}

/**
 * Guards cookie-authenticated mutations (refresh, logout) against cross-site
 * request forgery. Browsers always attach Origin to cross-origin POSTs and a
 * page cannot forge it, so we compare it (or the Referer's origin) to the
 * allow-list by exact match. A request that carries neither header is rejected.
 */
export function requireTrustedOrigin(getAllowed: () => string[] = () => parseAllowedOrigins(env.ALLOWED_ORIGINS)) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const originHeader = req.headers.origin;
        const referer = req.headers.referer;

        const candidate = typeof originHeader === 'string' && originHeader !== ''
            ? originHeader
            : typeof referer === 'string' ? originFromReferer(referer) : null;

        if (!candidate) {
            res.status(403).json({ error: 'csrf_origin_missing' });
            return;
        }

        const allowed = new Set(getAllowed().map(normalise));
        if (!allowed.has(normalise(candidate))) {
            res.status(403).json({ error: 'csrf_origin_rejected' });
            return;
        }

        next();
    };
}
