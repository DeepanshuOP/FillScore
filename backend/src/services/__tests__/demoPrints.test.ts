import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { DEMO_PRINTS_JSON } from '../../data/demoPrints';
import { demoPrintsFor } from '../demoPrints';

const OUT = path.resolve(__dirname, '../../../../ml-service/demo_v2/out');
const read = (...p: string[]) => fs.readFileSync(path.join(OUT, ...p), 'utf8');

// Two orders, with the values read from the checksummed Binance daily files by an independent reader
// (ml-service/tests/test_cut_demo_prints.py re-derives the committed windows row for row from the cached files):
//  A  ord-moderate-BNBUSDT-115583: arrival 1704308512910, one fill at 1704308513833 -> window [arrival - 5 000, fill + 5 000]
//     = [1704308507910, 1704308518833]; 37 prints in it, all kept (under the cap of 60).
//  B  ord-moderate-BNBUSDT-15169: arrival 1705587946747, last fill 1705588362760 -> window [1705587941747, 1705588367760], a
//     426 s wait; 1079 prints in it, the 60 nearest the fill kept (truncated).
describe('demo prints for the receipt', () => {
    it('the backend copy equals the committed build output, byte for byte', () => {
        for (const demo of ['demo-aggressive', 'demo-disciplined', 'demo-moderate']) {
            expect(DEMO_PRINTS_JSON[demo]).toBe(read(demo, 'prints.json'));
        }
        expect(Object.keys(DEMO_PRINTS_JSON).sort()).toEqual(['demo-aggressive', 'demo-disciplined', 'demo-moderate']);
    });

    it('order A: the window is arrival - 5 s to the last fill + 5 s with all 37 prints, from the file the ref names', () => {
        const w = demoPrintsFor('demo-moderate', 'ord-moderate-BNBUSDT-115583')!;
        expect(w.fromMs).toBe(1704308512910 - 5000);
        expect(w.toMs).toBe(1704308513833 + 5000);
        expect(w.arrivalMs).toBe(1704308512910);
        expect(w.total).toBe(37);
        expect(w.truncated).toBe(false);
        expect(w.prints).toHaveLength(37);
        expect(w.prints[0]).toEqual([516017107, 1704308507949, 313.3, 0.031, 0]);
        expect(w.prints[36]).toEqual([516017143, 1704308518750, 313.4, 0.119, 0]);
        expect(w.files).toEqual([{ symbol: 'BNBUSDT', date: '2024-01-03', sha256: '7648fc3ad6ab6a7beb016adffd1afe89ee5579ecce3c8aec7d05fe10e3b58f4c' }]);
    });

    it('order B: 1079 prints in the window, the 60 nearest the fill kept and the cap stated', () => {
        const w = demoPrintsFor('demo-moderate', 'ord-moderate-BNBUSDT-15169')!;
        expect(w.fromMs).toBe(1705587941747);
        expect(w.toMs).toBe(1705588367760);
        expect(w.total).toBe(1079);
        expect(w.truncated).toBe(true);
        expect(w.prints).toHaveLength(60);
        expect(w.prints[0]).toEqual([518783049, 1705588360918, 314.0, 0.2, 1]);
        expect(w.prints[59]).toEqual([518783108, 1705588364600, 313.8, 0.022, 1]);
        expect(w.files[0].sha256).toBe('c3572d218ae75a93625664dc616a672eca681a650135a072dca10129e4e26089');
    });

    it('every window holds at most 60 prints in id order inside its own bounds, and every file hash is in the build manifest', () => {
        const manifest = JSON.parse(read('manifest.json')) as { tapes: Array<{ symbol: string; day: string; sha256: string }> };
        const published = new Map(manifest.tapes.map((t) => [`${t.symbol}|${t.day}`, t.sha256]));
        let windows = 0;
        for (const demo of Object.keys(DEMO_PRINTS_JSON)) {
            const doc = JSON.parse(DEMO_PRINTS_JSON[demo]) as { windows: Record<string, { fromMs: number; toMs: number; total: number; truncated: boolean; prints: number[][]; files: Array<{ symbol: string; date: string; sha256: string }> }> };
            for (const w of Object.values(doc.windows)) {
                windows++;
                expect(w.prints.length).toBeLessThanOrEqual(60);
                expect(w.truncated).toBe(w.total > w.prints.length);
                expect(w.prints.map((r) => r[0])).toEqual([...w.prints.map((r) => r[0])].sort((a, b) => a - b));
                for (const r of w.prints) expect(r[1] >= w.fromMs && r[1] <= w.toMs).toBe(true);
                for (const f of w.files) expect(published.get(`${f.symbol}|${f.date}`)).toBe(f.sha256);
            }
        }
        expect(windows).toBe(309 + 138 + 234);
    });

    it('is null for a real account, an unknown demo, an unknown order and an order that never traded', () => {
        expect(demoPrintsFor('507f1f77bcf86cd799439011', 'ord-moderate-BNBUSDT-115583')).toBeNull();
        expect(demoPrintsFor('demo-nobody', 'ord-moderate-BNBUSDT-115583')).toBeNull();
        expect(demoPrintsFor('demo-moderate', 'no-such-order')).toBeNull();
        expect(demoPrintsFor('demo-moderate', '__proto__')).toBeNull();
    });
});
