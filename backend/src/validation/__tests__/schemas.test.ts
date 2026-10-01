import { describe, it, expect } from 'vitest';
import {
    runAuditQuerySchema,
    tradesQuerySchema,
    exportQuerySchema,
    noteBodySchema,
} from '../schemas';

describe('runAuditQuerySchema', () => {
    it('defaults to undefined when daysBack is omitted', () => {
        const parsed = runAuditQuerySchema.parse({});
        expect(parsed.daysBack).toBeUndefined();
    });

    it('coerces a numeric string', () => {
        expect(runAuditQuerySchema.parse({ daysBack: '30' }).daysBack).toBe(30);
    });

    it.each(['-1', '0', '91', '999999', '1.5', 'abc', ''])('rejects daysBack=%s', (v) => {
        expect(runAuditQuerySchema.safeParse({ daysBack: v }).success).toBe(false);
    });

    it('accepts the inclusive bounds 1 and 90', () => {
        expect(runAuditQuerySchema.parse({ daysBack: '1' }).daysBack).toBe(1);
        expect(runAuditQuerySchema.parse({ daysBack: '90' }).daysBack).toBe(90);
    });
});

describe('tradesQuerySchema', () => {
    it('applies page and limit defaults', () => {
        const parsed = tradesQuerySchema.parse({});
        expect(parsed.page).toBe(1);
        expect(parsed.limit).toBe(50);
    });

    it('allows the large fetches the trades and analytics pages use', () => {
        expect(tradesQuerySchema.parse({ limit: '1000' }).limit).toBe(1000);
        expect(tradesQuerySchema.parse({ limit: '10000' }).limit).toBe(10000);
    });

    it.each([
        { limit: '0' },
        { limit: '10001' },
        { limit: '-5' },
        { page: '0' },
        { page: 'NaN' },
        { side: 'HOLD' },
        { grade: 'Z' },
        { symbol: 'BTC$gt' },
        { symbol: '{"$ne":null}' },
    ])('rejects %j', (q) => {
        expect(tradesQuerySchema.safeParse(q).success).toBe(false);
    });

    it('accepts the ALL sentinel and real filters', () => {
        const parsed = tradesQuerySchema.parse({ symbol: 'BTCUSDT', side: 'BUY', grade: 'A' });
        expect(parsed).toMatchObject({ symbol: 'BTCUSDT', side: 'BUY', grade: 'A' });
        expect(tradesQuerySchema.safeParse({ symbol: 'ALL', side: 'ALL', grade: 'ALL' }).success).toBe(true);
    });
});

describe('exportQuerySchema', () => {
    it('normalises the exchange to lower case', () => {
        expect(exportQuerySchema.parse({ exchange: 'Binance' }).exchange).toBe('binance');
    });

    it.each(['.*', '^b', 'binance|bybit', '(a+)+$'])('rejects regex-like exchange %s', (v) => {
        expect(exportQuerySchema.safeParse({ exchange: v }).success).toBe(false);
    });

    it('accepts multi and ALL', () => {
        expect(exportQuerySchema.safeParse({ exchange: 'multi' }).success).toBe(true);
        expect(exportQuerySchema.safeParse({ exchange: 'ALL' }).success).toBe(true);
    });
});

describe('noteBodySchema', () => {
    it('requires a string note', () => {
        expect(noteBodySchema.safeParse({ note: 5 }).success).toBe(false);
        expect(noteBodySchema.safeParse({}).success).toBe(false);
    });

    it('trims and caps at 500 characters', () => {
        const parsed = noteBodySchema.parse({ note: `  ${'x'.repeat(900)}  ` });
        expect(parsed.note.length).toBe(500);
    });
});
