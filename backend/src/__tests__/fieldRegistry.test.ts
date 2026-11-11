import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Trade } from '../models/Trade';
import { Order } from '../models/Order';
import { FeeSnapshot } from '../models/FeeSnapshot';
import { OrderMeasurement } from '../models/OrderMeasurement';

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

const FULL = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../shared/fieldRegistry.json'), 'utf8'),
) as Record<string, Record<string, { type: string; nullable: boolean; owner: string }>>;

function pathsOf(schema: mongoose.Schema): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [p, st] of Object.entries(schema.paths)) {
        if (p === '_id' || p === '__v') continue;
        const top = p.split('.')[0];
        out[top] = p.includes('.') ? 'object' : ({ ...TYPE_OF, Array: 'array' } as Record<string, string>)[(st as any).instance] ?? (st as any).instance;
    }
    return out;
}

describe.each([
    ['Order', Order.schema], ['FeeSnapshot', FeeSnapshot.schema], ['OrderMeasurement', OrderMeasurement.schema],
] as const)('%s field registry (M1)', (name, schema) => {
    it('schema and registry list the same fields with the same types and an owner', () => {
        const s = pathsOf(schema);
        const reg = FULL[name];
        expect(reg, `registry missing collection ${name}`).toBeDefined();
        expect(Object.keys(s).sort()).toEqual(Object.keys(reg).sort());
        for (const [f, t] of Object.entries(s)) {
            expect(reg[f].type, `type of ${name}.${f}`).toBe(t);
            expect(reg[f].owner).toBeTruthy();
        }
    });
});

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
