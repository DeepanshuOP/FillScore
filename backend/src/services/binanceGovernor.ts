/**
 * One request-weight governor for every Binance call this server makes (manual sync, scheduled sync, history
 * backfill, klines): they share one IP, so they must share one budget (fourth order, step 4b).
 *
 * Sources (Binance Spot API docs, read 2026-11-22):
 *  - Limits are per IP, not per API key; every response carries `X-MBX-USED-WEIGHT-(intervalNum)(intervalLetter)`, so
 *    the one-minute count is `X-MBX-USED-WEIGHT-1M` (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/limits).
 *  - "A `Retry-After` header is sent with a 418 or 429 responses and will give the number of seconds required to wait"
 *    (same page; general-api-information). HTTP 429 = a rate limit was broken; HTTP 418 = the IP was auto-banned
 *    for continuing to send requests; "IP bans ... scale in duration for repeat offenders, from 2 minutes to 3 days".
 *  - The documented REQUEST_WEIGHT limit is 6000 per minute (exchangeInfo `rateLimits` example); the live value is read
 *    from exchangeInfo by the history sync and set with `setLimit`.
 *  - Not stated in the docs: whether the header count includes the request just made, and whether the minute is aligned or
 *    rolling. The governor therefore (a) keeps its own count of what it sent and uses the larger of that and the header,
 *    and (b) stops at 50% of the limit: if the window rolls, two adjacent windows can both count and still total at most
 *    100% of the limit.
 *
 * How it works: `acquire(weight)` reserves weight before a request (FIFO, so concurrent syncs queue instead of racing);
 * `record(weight, response)` settles it from the response. A request that would pass the budget waits until the end of the
 * one-minute window plus one second. A 429 pauses every caller for `Retry-After` (5 s if absent, at most 60 s). A 418 refuses
 * every caller with BinanceBanError for `Retry-After` (120 s, the documented minimum, if absent): nothing is queued
 * through a ban, and requests already waiting are refused too. In memory, per process (ARCHITECTURE.md §7).
 */

export const DEFAULT_WEIGHT_LIMIT_1M = 6000;
export const WEIGHT_BUDGET_FRACTION = 0.5;
const WINDOW_MS = 60_000;
const WINDOW_MARGIN_MS = 1_000;
const DEFAULT_429_MS = 5_000;
const MAX_429_MS = 60_000;
const DEFAULT_BAN_MS = 120_000;

export class BinanceBanError extends Error {
    constructor(public retryAfterMs: number) {
        super(`Binance has banned this IP; no request is sent for another ${Math.ceil(retryAfterMs / 1000)} s`);
        this.name = 'BinanceBanError';
    }
}

type HeaderBag = { get(name: string): string | null } | Record<string, unknown> | undefined;
export interface SettledResponse { status: number; headers?: HeaderBag }

function header(h: HeaderBag, name: string): string | null {
    if (!h) return null;
    if (typeof (h as { get?: unknown }).get === 'function') return (h as { get(n: string): string | null }).get(name);
    const bag = h as Record<string, unknown>;
    const key = Object.keys(bag).find((k) => k.toLowerCase() === name);
    const v = key === undefined ? undefined : bag[key];
    return v === undefined || v === null ? null : String(v);
}

function seconds(h: HeaderBag): number | null {
    const n = Number(header(h, 'retry-after'));
    return Number.isFinite(n) && n > 0 ? n * 1000 : null;
}

export interface GovernorOptions {
    limit?: number;
    fraction?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

export class BinanceGovernor {
    private limit: number;
    private fraction: number;
    private now: () => number;
    private sleep: (ms: number) => Promise<void>;
    private used = 0;
    private reserved = 0;
    private windowStart: number | null = null;
    private pausedUntil = 0;
    private bannedUntil = 0;
    private tail: Promise<unknown> = Promise.resolve();
    private releaseWaiters: Array<() => void> = [];

    constructor(opts: GovernorOptions = {}) {
        this.limit = opts.limit ?? DEFAULT_WEIGHT_LIMIT_1M;
        this.fraction = opts.fraction ?? WEIGHT_BUDGET_FRACTION;
        this.now = opts.now ?? Date.now;
        this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    }

    get budget(): number {
        return this.limit * this.fraction;
    }

    setLimit(limit: number): void {
        if (Number.isFinite(limit) && limit > 0) this.limit = limit;
    }

    snapshot() {
        const t = this.now();
        return {
            used: this.used,
            reserved: this.reserved,
            budget: this.budget,
            bannedForMs: Math.max(0, this.bannedUntil - t),
            pausedForMs: Math.max(0, this.pausedUntil - t),
        };
    }

    /** The remaining 429 pause in ms, once: it is cleared, so the caller that sleeps it is the only one to. */
    takePause(): number {
        const ms = Math.max(0, this.pausedUntil - this.now());
        this.pausedUntil = 0;
        return ms;
    }

    async waitIfPaused(): Promise<void> {
        const ms = this.takePause();
        if (ms > 0) await this.sleep(ms);
    }

    acquire(weight: number): Promise<void> {
        const mine = this.tail.then(() => this.reserve(weight));
        this.tail = mine.catch(() => undefined);   // a refusal does not stop the queue behind it
        return mine;
    }

    private notifyRelease(): void {
        const waiters = this.releaseWaiters.splice(0);
        for (const w of waiters) w();
    }

    private async reserve(weight: number): Promise<void> {
        for (;;) {
            const t = this.now();
            if (t < this.bannedUntil) throw new BinanceBanError(this.bannedUntil - t);
            const pause = this.takePause();
            if (pause > 0) {
                await this.sleep(pause);
                continue;
            }
            if (this.windowStart === null || t >= this.windowStart + WINDOW_MS) {
                this.used = 0;
                this.windowStart = t;
            }
            const counted = this.used + this.reserved;
            if (counted + weight <= this.budget || counted === 0) {
                this.reserved += weight;
                return;
            }
            if (this.used + weight <= this.budget) {
                // only requests in flight stand in the way: wait for one of them to be settled
                await new Promise<void>((resolve) => this.releaseWaiters.push(resolve));
                continue;
            }
            // the window's budget is spent: wait out the minute, then count from zero
            await this.sleep(Math.max(WINDOW_MARGIN_MS, this.windowStart + WINDOW_MS - t + WINDOW_MARGIN_MS));
            this.used = 0;
            this.windowStart = this.now();
        }
    }

    /** Settle a reservation from the response (any status). */
    record(weight: number, res: SettledResponse): void {
        this.reserved = Math.max(0, this.reserved - weight);
        const headerUsed = Number(header(res.headers, 'x-mbx-used-weight-1m'));
        this.used = Math.max(this.used + weight, Number.isFinite(headerUsed) && headerUsed > 0 ? headerUsed : 0);
        const t = this.now();
        if (res.status === 418) {
            this.bannedUntil = Math.max(this.bannedUntil, t + (seconds(res.headers) ?? DEFAULT_BAN_MS));
        } else if (res.status === 429) {
            this.pausedUntil = Math.max(this.pausedUntil, t + Math.min(seconds(res.headers) ?? DEFAULT_429_MS, MAX_429_MS));
        }
        this.notifyRelease();
    }

    /** Settle a reservation for a request that got no response: its weight may have been counted, so it is added. */
    release(weight: number): void {
        this.reserved = Math.max(0, this.reserved - weight);
        this.used += weight;
        this.notifyRelease();
    }

    /** acquire, call, record. A thrown error that carries a `response` (axios) is recorded from that response. */
    async run<T extends SettledResponse>(weight: number, call: () => Promise<T>): Promise<T> {
        await this.acquire(weight);
        try {
            const res = await call();
            this.record(weight, res);
            return res;
        } catch (e) {
            const response = (e as { response?: SettledResponse } | null)?.response;
            if (response) this.record(weight, response);
            else this.release(weight);
            throw e;
        }
    }
}

/** The governor every Binance call in this process goes through. */
export const binanceGovernor = new BinanceGovernor();
