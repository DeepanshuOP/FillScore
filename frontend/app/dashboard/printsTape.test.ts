import { describe, expect, it } from 'vitest';
import { parsePrintsWindow, printsLine, printsTapeGeometry, tickPath } from './printsTape';

/**
 * Hand arithmetic. A ticker tape runs in print order: print i of n sits at the centre of its slot. Box 320 x 84, side
 * padding 10, vertical padding 14: the tape axis runs x = 10 .. 310 (300 px), so with n = 3 the slot centres are
 * 10 + 300 x (0.5 / 3) = 60, 10 + 300 x (1.5 / 3) = 160 and 10 + 300 x (2.5 / 3) = 260. The price axis is y = 70 (low) .. 14 (high).
 *   print A: t 0,      price 100 -> x = 60,  y = 70
 *   print B: t 5 000,  price 110 -> x = 160, y = 14
 *   print C: t 10 000, price 105 -> x = 260, y = 70 - 0.5 x 56 = 42
 * A time between two prints is placed between their centres by time: the arrival at 2 500 lies half way from A (0) to B
 * (5 000), so x = 60 + 0.5 x 100 = 110. A fill at 5 000 is exactly B's time: x = 160. A time before the first print sits at the
 * tape's left edge (x = 10), after the last at the right edge (x = 310).
 */
const win = (over: Record<string, unknown> = {}) => ({
    symbol: 'BTCUSDT', arrivalMs: 2500, fromMs: 0, toMs: 10_000, total: 3, truncated: false,
    files: [{ symbol: 'BTCUSDT', date: '2024-01-03', sha256: 'ab'.repeat(32) }],
    prints: [[1, 0, 100, 1, 0], [2, 5000, 110, 1, 1], [3, 10_000, 105, 1, 0]],
    ...over,
});

describe('printsTapeGeometry', () => {
    it('places prints by time and price, the arrival and the fills', () => {
        const g = printsTapeGeometry(parsePrintsWindow(win())!, [{ timeMs: 5000, price: 110 }], 320, 84);
        expect(g.ticks.map((t) => [t.x, t.y, t.buyer])).toEqual([[60, 70, true], [160, 14, false], [260, 42, true]]);
        expect(g.arrivalX).toBe(110);
        expect(g.fills).toEqual([{ x: 160, y: 14 }]);
        expect(g.priceLow).toBe(100);
        expect(g.priceHigh).toBe(110);
    });

    it('a buyer-initiated print (is_buyer_maker 0) is a filled tick up; a seller-initiated one (1) is hollow down', () => {
        const g = printsTapeGeometry(parsePrintsWindow(win())!, [], 320, 84);
        expect(g.ticks.map((t) => t.buyer)).toEqual([true, false, true]);
        expect(tickPath(10, 70, true)).toBe('M8 73L12 73L10 66Z');     // apex 4 above, base 3 below, 2 either side
        expect(tickPath(10, 70, false)).toBe('M8 67L12 67L10 74Z');    // apex 4 below, base 3 above
    });

    it('one price only sits in the middle of the box; a fill price outside the prints widens the scale', () => {
        const flat = printsTapeGeometry(parsePrintsWindow(win({ prints: [[1, 0, 100, 1, 0], [2, 5000, 100, 1, 0]] }))!, [], 320, 84);
        expect(flat.ticks.map((t) => t.y)).toEqual([42, 42]);
        const wide = printsTapeGeometry(parsePrintsWindow(win())!, [{ timeMs: 5000, price: 120 }], 320, 84);
        expect(wide.priceHigh).toBe(120);                            // range 100..120: print B (110) is half way: y = 70 - 0.5 x 56 = 42
        expect(wide.ticks[1].y).toBe(42);
        expect(wide.fills[0].y).toBe(14);
    });

    it('a time before the first print or after the last is held at the tape\'s edge, not drawn off it', () => {
        const g = printsTapeGeometry(parsePrintsWindow(win())!, [{ timeMs: -500, price: 100 }, { timeMs: 99_999, price: 100 }], 320, 84);
        expect(g.fills.map((f) => f.x)).toEqual([10, 310]);
    });

    it('prints with the same time and a fill between prints: interpolated by time', () => {
        // prints at 0, 4 000 (two at 4 000) and 8 000: centres 10 + 300 x (0.5, 1.5, 2.5, 3.5) / 4 = 47.5, 122.5, 197.5, 272.5
        const w = parsePrintsWindow(win({ toMs: 8000, prints: [[1, 0, 100, 1, 0], [2, 4000, 100, 1, 0], [3, 4000, 100, 1, 1], [4, 8000, 100, 1, 0]] }))!;
        const g = printsTapeGeometry(w, [{ timeMs: 2000, price: 100 }, { timeMs: 6000, price: 100 }], 320, 84);
        expect(g.ticks.map((t) => t.x)).toEqual([47.5, 122.5, 197.5, 272.5]);
        // 2 000: half way from print 1 (0) to print 2 (4 000): 47.5 + 0.5 x 75 = 85; 6 000: after the two at 4 000 (centre 197.5), half way to print 4 (8 000): 197.5 + 0.5 x 75 = 235
        expect(g.fills.map((f) => f.x)).toEqual([85, 235]);
    });
});

describe('parsePrintsWindow', () => {
    it('is null when missing or malformed, so a real account and a damaged payload keep the current line', () => {
        expect(parsePrintsWindow(undefined)).toBeNull();
        expect(parsePrintsWindow(null)).toBeNull();
        expect(parsePrintsWindow({})).toBeNull();
        expect(parsePrintsWindow(win({ prints: 'x' }))).toBeNull();
        expect(parsePrintsWindow(win({ prints: [[1, 'a', 100, 1, 0]] }))).toBeNull();
        expect(parsePrintsWindow(win({ toMs: 0 }))).toBeNull();     // a window with no width
    });
    it('an empty list of prints is a valid window (the receipt then says there were none)', () => {
        expect(parsePrintsWindow(win({ prints: [], total: 0 }))?.prints).toEqual([]);
    });
});

describe('printsLine', () => {
    it('states how many prints are drawn, of how many in the window, and from which file', () => {
        const w = parsePrintsWindow(win({ total: 3 }))!;
        expect(printsLine(w)).toBe('3 public prints, 00:00:00 to 00:00:10 UTC, from the daily file 2024-01-03 (SHA-256 abababab…abab).');
    });
    it('says plainly when the window was capped', () => {
        const w = parsePrintsWindow(win({ total: 140, truncated: true, prints: Array.from({ length: 60 }, (_, i) => [i, i, 100, 1, 0]) }))!;
        expect(printsLine(w)).toBe('60 of 140 public prints in the window (the 60 nearest the fills), 00:00:00 to 00:00:10 UTC, from the daily file 2024-01-03 (SHA-256 abababab…abab).');
    });
    it('says none were printed when the window is empty, never an empty plot', () => {
        const w = parsePrintsWindow(win({ prints: [], total: 0 }))!;
        expect(printsLine(w)).toBe('No public prints in the window, 00:00:00 to 00:00:10 UTC (daily file 2024-01-03, SHA-256 abababab…abab).');
    });
});
