import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Static assertion: the demo data script is not exported as a function (it runs on import),
// so we read its source. Every Trade.updateOne upsert filter must carry the 4-field key
// {userId, exchange, symbol, tradeId}. Hand count: 1 upsert site (the profiles loop). The bybit, okx and multi
// blocks were removed on 2026-11-13 (decision 8); before that there were 4.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'seedDatabase.ts'), 'utf8');

describe('demo data upsert filters use the 4-field trade key', () => {
    const filters = [...SOURCE.matchAll(/Trade\.updateOne\(\s*(\{[^}]*\})/g)].map(m => m[1]);

    it('finds the one upsert call site', () => {
        expect(filters).toHaveLength(1);
    });

    it('every filter includes userId, exchange, symbol and tradeId', () => {
        for (const f of filters) {
            for (const field of ['userId', 'exchange', 'symbol', 'tradeId']) {
                expect(f, `filter ${f} is missing ${field}`).toContain(field);
            }
        }
    });
});
