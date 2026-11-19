/**
 * The design lab's hero fixture (M8 phase 2a, 2026-11-19): `hero-order.replay.json` must be exactly what
 * `buildOrderReplay` returns for the order in `hero-order.inputs.json` (the same mapping the route
 * GET /api/audit/orders/:orderId/replay applies to the stored documents). The inputs come from
 * ml-service/scripts/cut_hero_fixture.py (real public prints, the production mid function, the stored measurement).
 * To regenerate the replay file after a change of the builder: UPDATE_HERO_FIXTURE=1 npm test -- heroFixture.
 *
 * Hand values (shortfall of this order, from the stored measurement; intended notional 48.48757806057283):
 *   spread 1.5961691939331055 bps + impact and timing 3.1923383878698397 bps = execution 4.7885075818029454 bps
 *   fees 10.004788507581804 bps; total 14.793296089384748 bps = 4.7885075818029454 + 10.004788507581804 + 0.0 (unfilled)
 *   USD = bps x notional / 10,000: total 14.793296089384748 x 48.48757806057283 / 1e4 = 0.07173... (checked below to 1e-9)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOrderReplay } from '../services/orderReplay';

const DIR = resolve(__dirname, '../../../frontend/app/design-lab/fixtures');
const inputs = JSON.parse(readFileSync(resolve(DIR, 'hero-order.inputs.json'), 'utf8'));

function replay() {
    const o = inputs.order, m = inputs.measurement;
    return buildOrderReplay({
        order: { orderId: o.orderId, symbol: o.symbol, exchange: o.exchange, type: o.type ?? null, side: o.side, origQty: o.origQty, executedQty: o.executedQty,
            status: o.status, restingMs: o.restingMs ?? null, createdAt: new Date(o.createdAt), updatedAt: new Date(o.updatedAt) },
        fills: inputs.fills.map((f: any) => ({ tradeId: f.tradeId, executionPrice: f.executionPrice, quantity: f.quantity, executedAt: new Date(f.executedAt),
            feeUsd: f.feeUsd ?? null, isMaker: f.isMaker ?? null })),
        measurement: { version: m.version, arrivalMid: m.arrivalMid, endMid: m.endMid, endBasis: m.endBasis, unmeasuredReason: m.unmeasuredReason,
            shortfall: m.shortfall ?? null, expectedCost: m.expectedCost ?? null, marketDataRefs: m.marketDataRefs ?? [] },
    });
}

describe('hero fixture', () => {
    it('the committed replay equals the builder output for the committed inputs', () => {
        const built = replay();
        const file = resolve(DIR, 'hero-order.replay.json');
        if (process.env.UPDATE_HERO_FIXTURE === '1') writeFileSync(file, JSON.stringify(built, null, 1) + '\n');
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(built)));
    });

    it('the figures are the hand values of the stored measurement', () => {
        const d = Object.fromEntries(replay().decomposition.map(f => [f.key, f]));
        expect(d.spread.bps).toBeCloseTo(1.5961691939331055, 12);
        expect(d.impactTiming.bps).toBeCloseTo(3.1923383878698397, 12);
        expect(d.execution.bps).toBeCloseTo(1.5961691939331055 + 3.1923383878698397, 9);
        expect(d.fees.bps).toBeCloseTo(10.004788507581804, 12);
        expect(d.unfilled.bps).toBe(0);
        expect(d.total.bps).toBeCloseTo(4.7885075818029454 + 10.004788507581804, 9);
        expect(d.total.usd).toBeCloseTo(14.793296089384748 * 48.48757806057283 / 1e4, 9);
    });

    it('the tape is real, ordered and covers the order', () => {
        const t = inputs.tape;
        expect(t.prints.length).toBeGreaterThan(10);
        for (let i = 1; i < t.prints.length; i++) expect(t.prints[i].ts).toBeGreaterThanOrEqual(t.prints[i - 1].ts);
        expect(t.prints[0].ts).toBeLessThanOrEqual(t.arrivalMs);
        expect(t.prints[t.prints.length - 1].ts).toBeGreaterThan(t.fillMs);
        expect(t.sourceSha256).toBe(inputs.measurement.marketDataRefs[0].sha256);
    });
});
