import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { captureWithRequestId } from '../observability/sentry';
import { hashAccountId } from '../observability/requestLog';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    const requestId = (req as Request & { requestId?: string }).requestId ?? crypto.randomUUID();

    // A body that does not parse, or is too large, is the client's mistake: a 4xx, not logged and not sent to Sentry. body-parser attaches the raw
    // body to these errors, and it may hold a password or an exchange secret (security review, M9).
    if (err?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'The request body is not valid JSON', code: 'INVALID_JSON', requestId });
    }
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'The request body is too large', code: 'PAYLOAD_TOO_LARGE', requestId });
    }

    // Only the error's name and code are logged: the error object may carry request data (a body, a query, a database message).
    console.error(`[RequestID: ${requestId}] Unhandled Error: ${String(err?.name ?? 'Error')}${err?.code ? ` code=${String(err.code)}` : ''}`);
    // No-op unless Sentry was initialised (SENTRY_DSN); tagged with the same id as the log line.
    captureWithRequestId(err, requestId, hashAccountId((req as Request & { accountId?: string }).accountId));

    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map((val: any) => val.message);
        return res.status(400).json({ error: 'Validation Error', code: 'VALIDATION_ERROR', messages, requestId });
    }

    if (err.code === 'BINANCE_RATE_LIMIT') {
        return res.status(429).json({ error: 'Binance rate limit exceeded', code: err.code, requestId });
    }

    if (err.code === 'DECRYPTION_FAILED') {
        return res.status(401).json({ error: 'Failed to decrypt API keys', code: err.code, requestId });
    }

    // F-17: never return a stack trace or raw error text, in any environment. The requestId ties
    // the response to the server-side log line above.
    return res.status(500).json({ error: 'Internal server error', code: 'INTERNAL', requestId });
}
