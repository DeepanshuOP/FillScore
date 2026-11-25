import { describe, expect, it } from 'vitest';
import { chartSourceLine, parsePrintsWindow } from './printsTape';

/**
 * Design v5 step 6: the v4 tape component (PrintsTape) and its geometry and caption are removed; the receipt draws the Recharts chart
 * of the same stored public trades. What stays here is what the page still needs: reading the window safely (`parsePrintsWindow`)
 * and the one source line under the chart (`chartSourceLine`), which carries the facts the old caption carried: which file, and
 * how many of how many trades are drawn, and that a window with none says so instead of drawing an empty plot.
 */
const win = (over: Record<string, unknown> = {}) => ({
    symbol: 'BTCUSDT', arrivalMs: 2500, fromMs: 0, toMs: 10_000, total: 3, truncated: false,
    files: [{ symbol: 'BTCUSDT', date: '2024-01-03', sha256: 'ab'.repeat(32) }],
    prints: [[1, 0, 100, 1, 0], [2, 5000, 110, 1, 1], [3, 10_000, 105, 1, 0]],
    ...over,
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

describe('chartSourceLine', () => {
    it('names the source and the daily file, and points to the SHA-256 in the notes', () => {
        const w = parsePrintsWindow(win())!;
        expect(chartSourceLine(w)).toBe('Source: Binance public trades, 2024-01-03; SHA-256 in Notes.');
    });
    it('names two daily files when the window crosses midnight', () => {
        const w = parsePrintsWindow(win({ files: [{ symbol: 'BTCUSDT', date: '2024-01-03', sha256: 'ab'.repeat(32) }, { symbol: 'BTCUSDT', date: '2024-01-04', sha256: 'cd'.repeat(32) }] }))!;
        expect(chartSourceLine(w)).toBe('Source: Binance public trades, 2024-01-03 and 2024-01-04; SHA-256 in Notes.');
    });
    it('says plainly when the window was capped: 60 of 140 drawn, the ones nearest the fills', () => {
        const w = parsePrintsWindow(win({ total: 140, truncated: true, prints: Array.from({ length: 60 }, (_, i) => [i, i, 100, 1, 0]) }))!;
        expect(chartSourceLine(w)).toBe('Source: Binance public trades, 2024-01-03; SHA-256 in Notes. The chart shows 60 of 140 public trades, the ones nearest the fills.');
    });
    it('says none fell in the window when it is empty, never a silent empty plot', () => {
        const w = parsePrintsWindow(win({ prints: [], total: 0 }))!;
        expect(chartSourceLine(w)).toBe('Source: Binance public trades, 2024-01-03; SHA-256 in Notes. No public trade fell in the window.');
    });
    it('without a file it still names the source', () => {
        const w = parsePrintsWindow(win({ files: [] }))!;
        expect(chartSourceLine(w)).toBe('Source: Binance public trades; SHA-256 in Notes.');
    });
});
