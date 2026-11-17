import { describe, it, expect } from 'vitest';
import { TtlCache } from '../ttlCache';

// M5: a small in-memory cache with a time limit, for answers that cost a database read and a signature. Fake clock, exact values.
describe('TtlCache', () => {
    const make = (ttl = 1000, max = 3) => {
        let now = 1_000_000;
        const c = new TtlCache<string>(ttl, max, () => now);
        return { c, tick: (ms: number) => { now += ms; } };
    };
    it('returns what was stored until the time limit, then nothing', () => {
        const { c, tick } = make(1000);
        c.set('a', 'x');
        expect(c.get('a')).toBe('x');
        tick(999);
        expect(c.get('a')).toBe('x');                       // 999 ms: still inside the limit
        tick(1);
        expect(c.get('a')).toBeUndefined();                  // 1000 ms: gone
    });
    it('a miss is undefined, and a stored empty string is still a hit', () => {
        const { c } = make();
        expect(c.get('none')).toBeUndefined();
        c.set('e', '');
        expect(c.get('e')).toBe('');
    });
    it('keeps at most `max` entries: the oldest goes first', () => {
        const { c, tick } = make(10_000, 3);
        for (const k of ['a', 'b', 'c']) { c.set(k, k); tick(1); }
        c.set('d', 'd');                                      // 4th entry: 'a' (the oldest) is dropped
        expect([c.get('a'), c.get('b'), c.get('c'), c.get('d')]).toEqual([undefined, 'b', 'c', 'd']);
        expect(c.size()).toBe(3);
    });
    it('setting a key again replaces it and restarts its time', () => {
        const { c, tick } = make(1000);
        c.set('a', 'x'); tick(900);
        c.set('a', 'y'); tick(900);
        expect(c.get('a')).toBe('y');                         // 900 ms after the second set
    });
    it('delete and clear', () => {
        const { c } = make();
        c.set('a', 'x'); c.set('b', 'y');
        c.delete('a');
        expect(c.get('a')).toBeUndefined();
        c.clear();
        expect(c.size()).toBe(0);
    });
    it('deletes by prefix, so one account\'s entries can go without touching another\'s', () => {
        const { c } = make(10_000, 10);
        c.set('acc1:x', '1'); c.set('acc1:y', '2'); c.set('acc2:x', '3');
        c.deleteByPrefix('acc1:');
        expect([c.get('acc1:x'), c.get('acc1:y'), c.get('acc2:x')]).toEqual([undefined, undefined, '3']);
    });
});
