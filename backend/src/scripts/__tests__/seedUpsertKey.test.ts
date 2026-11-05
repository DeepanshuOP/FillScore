import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Static assertion: the demo data script is not exported as a function (it runs on import),
// so we read its source. Every Trade.updateOne upsert filter must carry the 4-field key
// {userId, exchange, symbol, tradeId}. Hand count: 4 upsert sites (3 profiles loop, bybit, okx, multi)
// = 5 call sites in total: profiles, bybit, okx, multi = 4 distinct blocks.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'seedDatabase.ts'), 'utf8');

describe('demo data upsert filters use the 4-field trade key', () => {
    const filters = [...SOURCE.matchAll(/Trade\.updateOne\(\s*(\{[^}]*\})/g)].map(m => m[1]);

    it('finds the four upsert call sites', () => {
        expect(filters).toHaveLength(4);
    });

    it('every filter includes userId, exchange, symbol and tradeId', () => {
        for (const f of filters) {
            for (const field of ['userId', 'exchange', 'symbol', 'tradeId']) {
                expect(f, `filter ${f} is missing ${field}`).toContain(field);
            }
        }
    });
});
