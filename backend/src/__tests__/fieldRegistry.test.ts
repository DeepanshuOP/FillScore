import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Trade } from '../models/Trade';

// Registry is read by tests/scripts only, never at service runtime (Docker contexts lack shared/).
const REGISTRY = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../shared/fieldRegistry.json'), 'utf8'),
).Trade as Record<string, { type: string; nullable: boolean; owner: string; keys?: string[] }>;

const TYPE_OF: Record<string, string> = {
    String: 'string', Number: 'number', Boolean: 'bool', Date: 'datetime', Mixed: 'object', Embedded: 'object',
    ObjectId: 'string',
};

// Top-level schema paths (nested `whaleTopEvent.side` collapses to `whaleTopEvent`), minus mongoose internals.
function schemaFields(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [p, st] of Object.entries(Trade.schema.paths)) {
        if (p === '_id' || p === '__v') continue;
        const top = p.split('.')[0];
        out[top] = p.includes('.') ? 'object' : TYPE_OF[(st as any).instance] ?? (st as any).instance;
    }
    return out;
}

describe('Trade field registry', () => {
    it('every Trade schema path is in the registry with a matching type', () => {
        for (const [field, type] of Object.entries(schemaFields())) {
            expect(REGISTRY[field], `registry missing ${field}`).toBeDefined();
            expect(REGISTRY[field].type, `type of ${field}`).toBe(type);
            expect(REGISTRY[field].owner, `owner of ${field}`).toBeTruthy();
        }
    });

    it('registry has no field the schema lacks', () => {
        const schema = schemaFields();
        for (const field of Object.keys(REGISTRY)) {
            expect(schema[field], `schema missing ${field}`).toBeDefined();
        }
    });

    it('declares the 4a collision fields exactly', () => {
        expect(REGISTRY.spreadBps).toMatchObject({ type: 'number', nullable: true, owner: 'backend/src/services/MarketDataService.ts' });
        expect(REGISTRY.spreadEstimates).toMatchObject({
            type: 'object', nullable: true, owner: 'ml-service/scripts/backfill_markouts.py',
            keys: ['cs', 'ar', 'n_pairs', 'version'],
        });
        expect(REGISTRY.halfSpreadBps.type).toBe('number');
        expect(REGISTRY.postPrices.type).toBe('object');
        expect(REGISTRY.markoutVersion.type).toBe('number');
    });
});
