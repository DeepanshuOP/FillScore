import { z } from 'zod';
import { Response } from 'express';

export const MAX_DAYS_BACK = 90;
export const MAX_PAGE_SIZE = 10000;
export const NOTE_MAX_LENGTH = 500;

const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;
const intFromQuery = (min: number, max: number) =>
    z.coerce.number().int().min(min).max(max);

export const runAuditQuerySchema = z.object({
    daysBack: intFromQuery(1, MAX_DAYS_BACK).optional(),
});

export const historyQuerySchema = z.object({
    limit: intFromQuery(1, 365).default(90),
});

export const tradesQuerySchema = z.object({
    symbol: z.union([z.literal('ALL'), z.string().regex(SYMBOL_PATTERN)]).optional(),
    side: z.enum(['BUY', 'SELL', 'ALL']).optional(),
    grade: z.enum(['A', 'B', 'C', 'D', 'F', 'ALL']).optional(),
    page: intFromQuery(1, 100000).default(1),
    limit: intFromQuery(1, MAX_PAGE_SIZE).default(50),
});

export const exportQuerySchema = z.object({
    exchange: z
        .string()
        .toLowerCase()
        .pipe(z.enum(['binance', 'bybit', 'okx', 'multi', 'all']))
        .optional(),
    symbol: z.union([z.literal('ALL'), z.string().regex(SYMBOL_PATTERN)]).optional(),
});

export const connectBodySchema = z.object({
    exchange: z.enum(['binance', 'bybit', 'okx']),
    apiKey: z.string().trim().min(1).max(256),
    apiSecret: z.string().trim().min(1).max(256),
    apiPassphrase: z.string().trim().min(1).max(128).optional(),
});

export const downloadTokenBodySchema = z.object({
    kind: z.enum(['report', 'export']),
});

export const noteBodySchema = z.object({
    note: z.string().transform(v => v.trim().substring(0, NOTE_MAX_LENGTH)),
});

/**
 * Parses `data` against `schema`. On failure it writes a 400 with the offending
 * field paths and returns null, so callers can `if (!parsed) return;`.
 */
export function parseOrReject<S extends z.ZodTypeAny>(
    schema: S,
    data: unknown,
    res: Response
): z.output<S> | null {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    res.status(400).json({
        error: 'invalid_request',
        details: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    });
    return null;
}
