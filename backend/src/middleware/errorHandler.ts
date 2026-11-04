import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
    const requestId = crypto.randomUUID();
    console.error(`[RequestID: ${requestId}] Unhandled Error:`, err);

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
