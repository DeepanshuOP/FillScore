import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// A stable, non-reversible tag for an account id; never the email or the raw id.
export function hashAccountId(id: string | undefined | null): string | undefined {
    if (!id) return undefined;
    return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12);
}

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

// Request id (honours a sane incoming x-request-id) + one JSON log line per request on finish.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const start = performance.now();
    res.on('finish', () => {
        console.log(JSON.stringify({
            msg: 'request', requestId, method: req.method, path: req.path, status: res.statusCode,
            ms: Math.round((performance.now() - start) * 100) / 100,
            account: hashAccountId((req as Request & { accountId?: string }).accountId),
        }));
    });
    next();
}
