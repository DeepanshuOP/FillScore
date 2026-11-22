import { describe, expect, it } from 'vitest';
import { BinanceBanError, BinanceGovernor } from '../binanceGovernor';

/**
 * Hand-computed cases. limit 100, fraction 0.5 -> budget 50. The clock is fake: sleep(ms) advances it by ms.
 * A window starts at the first reservation after the previous window ended and lasts 60 000 ms; when the budget is
 * spent the governor waits until the window's end plus a 1 000 ms safety margin (61 000 ms from its start).
 */
const T0 = 60_000 * 10;

function setup(limit = 100, fraction = 0.5) {
    const clock = { t: T0 };
    const sleeps: number[] = [];
    const gov = new BinanceGovernor({
        limit,
        fraction,
        now: () => clock.t,
        sleep: async (ms) => {
            sleeps.push(ms);
            clock.t += ms;
        },
    });
    return { clock, sleeps, gov };
}

const ok = (used?: number) => ({ status: 200, headers: used === undefined ? {} : { 'x-mbx-used-weight-1m': String(used) } });

describe('BinanceGovernor: used weight and the budget', () => {
    it('budget is limit x fraction', () => {
        expect(setup(100, 0.5).gov.budget).toBe(50);
        expect(setup(6000, 0.5).gov.budget).toBe(3000);
    });

    it('header sequence 10, 45: 10+30 fits (40 <= 50); then 45+10 = 55 > 50 waits for the window end plus 1 s', async () => {
        const { gov, sleeps, clock } = setup();
        await gov.acquire(10);                       // used 0 + 10 <= 50
        gov.record(10, ok(10));                      // used = max(0+10, 10) = 10
        await gov.acquire(30);                       // 10 + 30 = 40 <= 50
        gov.record(30, ok(45));                      // used = max(10+30, 45) = 45 (another process on the IP added 5)
        expect(gov.snapshot().used).toBe(45);
        expect(sleeps).toEqual([]);
        await gov.acquire(10);                       // 45 + 10 = 55 > 50: wait 60 000 (window end) + 1 000
        expect(sleeps).toEqual([61_000]);
        expect(clock.t).toBe(T0 + 61_000);
        expect(gov.snapshot().used).toBe(0);         // a new window
    });

    it('a header below our own count does not lower it: weights 20 and 20, header 5 -> used 40', async () => {
        const { gov } = setup();
        await gov.acquire(20);
        gov.record(20, ok(5));                       // max(0+20, 5) = 20
        await gov.acquire(20);
        gov.record(20, ok(5));                       // max(20+20, 5) = 40
        expect(gov.snapshot().used).toBe(40);
    });

    it('without a header the weight is added: 15 + 15 -> 30', async () => {
        const { gov } = setup();
        await gov.acquire(15);
        gov.record(15, ok());
        await gov.acquire(15);
        gov.record(15, ok());
        expect(gov.snapshot().used).toBe(30);
    });

    it('a request waits for in-flight ones: 40 in flight, a second 40 queues and goes when the first is recorded and the budget allows', async () => {
        const { gov, sleeps } = setup();
        await gov.acquire(40);                       // reserved 40
        let second = false;
        const p = gov.acquire(5).then(() => (second = true));   // 40 + 5 = 45 <= 50: goes at once
        await p;
        expect(second).toBe(true);
        let third = false;
        const q = gov.acquire(10).then(() => (third = true));   // 40 + 5 + 10 = 55 > 50 reserved: queues, no sleep (it will be freed by a record)
        await Promise.resolve();
        await Promise.resolve();
        expect(third).toBe(false);
        gov.record(40, ok(40));                      // used 40, reserved 5: 40 + 5 + 10 = 55 > 50 -> still has to wait for the window
        gov.record(5, ok(45));                       // used 45, reserved 0: 45 + 10 = 55 > 50 -> wait for the window end
        await q;
        expect(third).toBe(true);
        expect(sleeps).toEqual([61_000]);
    });

    it('a single request heavier than the whole budget still goes when nothing else is counted (no deadlock)', async () => {
        const { gov, sleeps } = setup(100, 0.5);
        await gov.acquire(80);
        expect(sleeps).toEqual([]);
    });
});

describe('BinanceGovernor: 429 and 418', () => {
    it('429 with Retry-After 7: the next request waits 7 000 ms', async () => {
        const { gov, sleeps, clock } = setup();
        await gov.acquire(5);
        gov.record(5, { status: 429, headers: { 'retry-after': '7' } });
        await gov.acquire(5);
        expect(sleeps).toEqual([7_000]);
        expect(clock.t).toBe(T0 + 7_000);
    });

    it('429 without Retry-After waits 5 000 ms; a huge Retry-After is capped at 60 000 ms', async () => {
        const a = setup();
        await a.gov.acquire(5);
        a.gov.record(5, { status: 429, headers: {} });
        await a.gov.acquire(5);
        expect(a.sleeps).toEqual([5_000]);
        const b = setup();
        await b.gov.acquire(5);
        b.gov.record(5, { status: 429, headers: { 'retry-after': '900' } });
        await b.gov.acquire(5);
        expect(b.sleeps).toEqual([60_000]);
    });

    it('takePause returns the wait once and clears it', async () => {
        const { gov } = setup();
        await gov.acquire(5);
        gov.record(5, { status: 429, headers: { 'retry-after': '3' } });
        expect(gov.takePause()).toBe(3_000);
        expect(gov.takePause()).toBe(0);
    });

    it('418 with Retry-After 120: every request is refused for 120 000 ms, then allowed again', async () => {
        const { gov, clock, sleeps } = setup();
        await gov.acquire(5);
        gov.record(5, { status: 418, headers: { 'retry-after': '120' } });
        await expect(gov.acquire(1)).rejects.toMatchObject({ name: 'BinanceBanError', retryAfterMs: 120_000 });
        clock.t += 119_999;
        await expect(gov.acquire(1)).rejects.toMatchObject({ retryAfterMs: 1 });
        clock.t += 1;                                // exactly 120 000 ms after the 418
        await gov.acquire(1);
        expect(sleeps).toEqual([]);                  // refused, never queued
    });

    it('418 without Retry-After is treated as the documented minimum ban of 2 minutes', async () => {
        const { gov } = setup();
        await gov.acquire(5);
        gov.record(5, { status: 418, headers: {} });
        await expect(gov.acquire(1)).rejects.toBeInstanceOf(BinanceBanError);
        expect(gov.snapshot().bannedForMs).toBe(120_000);
    });

    it('a request already waiting is refused when a 418 arrives, not sent', async () => {
        const { gov } = setup();
        await gov.acquire(40);                       // in flight
        const queued = gov.acquire(20).then(() => 'sent', (e) => e);   // 40 + 20 = 60 > 50 in flight: waits for a record
        await Promise.resolve();
        gov.record(40, { status: 418, headers: { 'retry-after': '30' } });
        expect(await queued).toBeInstanceOf(BinanceBanError);
    });

    it('run(): records the answer, and the response carried by an axios-style error', async () => {
        const { gov } = setup();
        const r = await gov.run(10, async () => ({ status: 200, headers: { 'x-mbx-used-weight-1m': '12' } }));
        expect(r.status).toBe(200);
        expect(gov.snapshot().used).toBe(12);        // max(0+10, 12)
        const err = Object.assign(new Error('429'), { response: { status: 429, headers: { 'retry-after': '4' } } });
        await expect(gov.run(10, async () => { throw err; })).rejects.toBe(err);
        expect(gov.takePause()).toBe(4_000);
    });

    it('run(): a call that fails with no response still counts its weight and frees its reservation', async () => {
        const { gov } = setup();
        await expect(gov.run(10, async () => { throw new Error('socket hang up'); })).rejects.toThrow('socket hang up');
        expect(gov.snapshot()).toMatchObject({ used: 10, reserved: 0 });
    });
});

/**
 * Ten account syncs at once against a fake Binance with limit 1000 (budget 500). Each sync makes 8 myTrades calls of
 * weight 20: 10 x 8 x 20 = 1600 weight in 80 calls. A window holds 500 / 20 = 25 calls, so 80 calls need
 * ceil(80 / 25) = 4 windows: 25 + 25 + 25 + 5, with 3 waits of 61 000 ms. The fake server counts weight per minute
 * (minute = floor(t / 60 000)), answers 429 over 1000 and reports X-MBX-USED-WEIGHT-1M.
 */
describe('BinanceGovernor: ten concurrent account syncs never exceed the budget', () => {
    it('keeps the fake exchange at or below 500 weight in any minute, with no 429', async () => {
        const { gov, clock, sleeps } = setup(1000, 0.5);
        const perMinute = new Map<number, number>();
        let rejected429 = 0;
        let done = 0;
        const exchange = async (weight: number) => {
            const minute = Math.floor(clock.t / 60_000);
            const used = (perMinute.get(minute) ?? 0) + weight;
            perMinute.set(minute, used);
            if (used > 1000) {
                rejected429++;
                return { status: 429, headers: { 'retry-after': '5' } };
            }
            return { status: 200, headers: { 'x-mbx-used-weight-1m': String(used) } };
        };
        const sync = async () => {
            for (let i = 0; i < 8; i++) {
                await gov.run(20, () => exchange(20));
                done++;
            }
        };
        await Promise.all(Array.from({ length: 10 }, () => sync()));
        expect(done).toBe(80);
        expect(rejected429).toBe(0);
        expect(Math.max(...perMinute.values())).toBe(500);          // 25 calls x 20, the budget exactly
        expect([...perMinute.values()].every((v) => v <= 500)).toBe(true);
        expect(sleeps).toEqual([61_000, 61_000, 61_000]);
        expect(clock.t).toBe(T0 + 3 * 61_000);
    });
});
