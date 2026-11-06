import { describe, it, expect } from 'vitest';
import { fillMarkoutBps, summariseMarkouts, MarkoutTrade } from '../markouts';

// Same hand-computed vectors as ml-service/tests/test_markout_packet.py (cross-language convention check).
describe('markouts', () => {
    it('buy up is favourable, buy down adverse, sell down favourable', () => {
        expect(fillMarkoutBps('BUY', 100, 100.1)).toBeCloseTo(10, 9);   // (100.1-100)/100*1e4
        expect(fillMarkoutBps('BUY', 100, 99.9)).toBeCloseTo(-10, 9);
        expect(fillMarkoutBps('SELL', 200, 199)).toBeCloseTo(50, 9);    // -1*(199-200)/200*1e4
        expect(fillMarkoutBps('BUY', 100, null)).toBeNull();
    });

    const trades: MarkoutTrade[] = [
        { side: 'BUY', isMaker: true, executionPrice: 100, postPrices: { '1': 100.1, '5': null, '30': 100, '60': 99.9, '300': 100.2 } },
        { side: 'SELL', isMaker: false, executionPrice: 200, postPrices: { '1': 199, '5': 200, '30': 201, '60': null, '300': 198 } },
    ];

    it('aggregates per horizon with maker/taker split and drops missing horizons', () => {
        const s = summariseMarkouts(trades);
        const h1 = s.find((x) => x.horizonS === 1)!;
        expect(h1.n).toBe(2);
        expect(h1.meanBps).toBeCloseTo(30, 9);                          // (10+50)/2
        expect(h1.maker.meanBps).toBeCloseTo(10, 9);
        expect(h1.taker.meanBps).toBeCloseTo(50, 9);
        const h60 = s.find((x) => x.horizonS === 60)!;
        expect(h60.n).toBe(1);
        expect(h60.meanBps).toBeCloseTo(-10, 9);
        expect(h60.taker).toEqual({ n: 0, meanBps: null });
    });

    it('un-enriched trades give n=0 and null means', () => {
        const s = summariseMarkouts([{ side: 'BUY', executionPrice: 1, isMaker: true }]);
        expect(s.every((x) => x.n === 0 && x.meanBps === null)).toBe(true);
    });
});
