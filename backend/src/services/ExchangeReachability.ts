import axios from 'axios';
import { assertAllowedUrl } from './exchangeEgress';
import { BinanceGovernor, SettledResponse, binanceGovernor, binanceDataGovernor } from './binanceGovernor';

// Design v5 step 0 (2026-11-23): the Binance probe goes to the public market-data host. Binance lists GET /api/v3/time on
// data-api.binance.vision (https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, read
// 2026-11-23). api.binance.com (signed account calls only) is never probed: its state is read from its governor.
const BINANCE_DATA_HOST = 'data-api.binance.vision';
const BINANCE_TIME_URL = `https://${BINANCE_DATA_HOST}/api/v3/time`;
type Probed = ExchangeReachabilityResult & { retryAfterHeader?: string | null };

/** Retry-After from axios headers (AxiosHeaders has a case-insensitive get) or a plain object; null when absent. */
function retryAfterOf(h: unknown): string | null {
    if (!h || typeof h !== 'object') return null;
    const g = (h as { get?: unknown }).get;
    if (typeof g === 'function') { const v = g.call(h, 'retry-after'); return v == null ? null : String(v); }
    const bag = h as Record<string, unknown>;
    const k = Object.keys(bag).find((x) => x.toLowerCase() === 'retry-after');
    return k === undefined || bag[k] == null ? null : String(bag[k]);
}

export type ExchangeName = 'binance' | 'bybit' | 'bybit-alt' | 'okx';

export type ReachabilityStatus =
    | 'reachable'
    | 'geo_blocked'
    | 'rate_limited'
    | 'forbidden'
    | 'error'
    | 'unreachable';

export interface ExchangeReachabilityResult {
    exchange: ExchangeName;
    status: ReachabilityStatus;
    httpStatus: number | null;
    latencyMs: number;
    checkedAt: string;
    detail: string;
    /** Binance only: the host this entry probed (data-api.binance.vision). */
    host?: string;
    /** Binance only (the market-data governor; fifth order step 0c, design v5 step 0):
     *  'binance_sent' = this probe sent the request and httpStatus is Binance's answer;
     *  'governor_paused' = nothing was sent because the market-data governor holds a pause from an earlier 418/429
     *  (httpStatus is that earlier status). */
    source?: 'binance_sent' | 'governor_paused';
    /** Seconds the market-data governor will still refuse or hold requests (0 when none). */
    pauseRemainingS?: number;
    /** Retry-After in seconds as Binance sent it (the earlier block's for 'governor_paused'); null when absent. */
    retryAfterS?: number | null;
    /** Binance only: api.binance.com (signed account calls) as its governor sees it. No request is sent to probe it. */
    accountApi?: AccountApiState;
}

export interface AccountApiState {
    host: 'api.binance.com';
    /** true while the account governor refuses (418) or holds (429) every signed call */
    paused: boolean;
    /** the 418/429 that set the pause; null when there is none */
    httpStatus: 418 | 429 | null;
    pauseRemainingS: number;
    retryAfterS: number | null;
}

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

const PROBE_TARGETS: { exchange: ExchangeName; url: string }[] = [
    { exchange: 'binance', url: BINANCE_TIME_URL },
    { exchange: 'bybit', url: 'https://api.bybit.com/v5/market/time' },
    { exchange: 'okx', url: 'https://www.okx.com/api/v5/public/time' },
    { exchange: 'bybit-alt', url: 'https://api.bytick.com/v5/market/time' },
];

/**
 * Maps a raw HTTP status to our classification. Unlisted codes fall back to
 * 'error' rather than 'reachable' — an unrecognized non-2xx should never read
 * as healthy.
 */
function classifyStatus(status: number): { status: ReachabilityStatus; detail: string } {
    if (status === 200) return { status: 'reachable', detail: 'HTTP 200' };
    if (status === 451) return { status: 'geo_blocked', detail: 'HTTP 451 (geo-restricted)' };
    if (status === 418 || status === 429) return { status: 'rate_limited', detail: `HTTP ${status} (rate limited)` };
    if (status === 403) return { status: 'forbidden', detail: 'HTTP 403 (forbidden)' };
    if (status === 500 || status === 503) return { status: 'error', detail: `HTTP ${status} (upstream error)` };
    return { status: 'error', detail: `HTTP ${status} (unexpected)` };
}

/**
 * Probes one exchange's public, unauthenticated time endpoint. Never throws —
 * a failure is a successful response from us describing that failure. Races
 * the axios call against our own timer so a hung request (not just a network
 * error) resolves to 'unreachable' at exactly TIMEOUT_MS, regardless of what
 * axios's own `timeout` option does.
 */
async function probeOne(exchange: ExchangeName, url: string, onResponse?: (res: SettledResponse) => void): Promise<Probed> {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const timeoutGuard = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), TIMEOUT_MS);
    });

    try {
        assertAllowedUrl(url);   // host allow-list, https only; redirects are not followed
        const response = await Promise.race([
            axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true, maxRedirects: 0 }),
            timeoutGuard,
        ]);
        clearTimeout(timer!);
        onResponse?.({ status: response.status, headers: response.headers as SettledResponse['headers'] });
        const { status, detail } = classifyStatus(response.status);
        return {
            exchange,
            status,
            httpStatus: response.status,
            latencyMs: Math.round(performance.now() - start),
            checkedAt: new Date().toISOString(),
            detail,
            retryAfterHeader: retryAfterOf(response.headers),
        };
    } catch {
        clearTimeout(timer!);
        return {
            exchange,
            status: 'unreachable',
            httpStatus: null,
            latencyMs: Math.round(performance.now() - start),
            checkedAt: new Date().toISOString(),
            detail: 'request failed or timed out',
        };
    }
}

/**
 * Probes all three exchanges in parallel. probeOne() never rejects, so
 * allSettled's 'rejected' branch below is defense-in-depth, not the normal
 * path — one exchange failing never prevents the others from reporting.
 */
const TIME_WEIGHT = 1;   // GET /api/v3/time, IP weight 1 (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-endpoints)

const pauseMs = (gov: BinanceGovernor) => { const s = gov.snapshot(); return Math.max(s.bannedForMs, s.pausedForMs); };

/** api.binance.com as its governor sees it (a 418 or 429 answered to a signed call); nothing is sent. */
function accountApiState(acct: BinanceGovernor): AccountApiState {
    const s = acct.snapshot();
    const waiting = pauseMs(acct);
    return {
        host: 'api.binance.com', paused: waiting > 0,
        httpStatus: waiting > 0 ? (s.bannedForMs > 0 ? 418 : 429) : null,
        pauseRemainingS: Math.ceil(waiting / 1000),
        retryAfterS: waiting > 0 ? s.lastBlock?.retryAfterS ?? null : null,
    };
}

/**
 * The Binance probe goes to data-api.binance.vision through the market-data governor: during a pause it sends nothing (no
 * weight spent, the ban is not extended) and says so; otherwise it sends and records the answer, so a 418/429 it receives
 * pauses the market-data callers (klines, exchangeInfo), not the signed account calls.
 */
async function probeBinance(data: BinanceGovernor, acct: BinanceGovernor): Promise<ExchangeReachabilityResult> {
    const accountApi = accountApiState(acct);
    const waiting = pauseMs(data);
    if (waiting > 0) {
        const s = data.snapshot();
        const code = s.bannedForMs > 0 ? 418 : 429;
        return {
            exchange: 'binance', status: 'rate_limited', httpStatus: code, latencyMs: 0, checkedAt: new Date().toISOString(),
            detail: `HTTP ${code} received earlier; paused, no request sent`, host: BINANCE_DATA_HOST,
            source: 'governor_paused', pauseRemainingS: Math.ceil(waiting / 1000), retryAfterS: s.lastBlock?.retryAfterS ?? null, accountApi,
        };
    }
    const r = await probeOne('binance', BINANCE_TIME_URL, (res) => data.observe(TIME_WEIGHT, res));
    const header = Number(r.retryAfterHeader);
    const { retryAfterHeader: _h, ...out } = r;
    return { ...out, host: BINANCE_DATA_HOST, source: 'binance_sent', pauseRemainingS: Math.ceil(pauseMs(data) / 1000),
        retryAfterS: Number.isFinite(header) && header > 0 ? header : null, accountApi };
}

export async function probeAllExchanges(data: BinanceGovernor = binanceDataGovernor, acct: BinanceGovernor = binanceGovernor): Promise<ExchangeReachabilityResult[]> {
    const settled = await Promise.allSettled(PROBE_TARGETS.map(({ exchange, url }) =>
        exchange === 'binance' ? probeBinance(data, acct) : probeOne(exchange, url).then(({ retryAfterHeader: _h, ...r }) => r)));

    return settled.map((outcome, i) => {
        if (outcome.status === 'fulfilled') return outcome.value;
        return {
            exchange: PROBE_TARGETS[i].exchange,
            status: 'unreachable',
            httpStatus: null,
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
            detail: 'probe failed unexpectedly',
        };
    });
}

let cache: { exchanges: ExchangeReachabilityResult[]; checkedAt: string; expiresAt: number } | null = null;

/**
 * Cached wrapper around probeAllExchanges(), TTL 60s, so this endpoint can't
 * be used to hammer any of the three exchanges regardless of client request rate.
 */
export async function getExchangeReachability(): Promise<{
    checkedAt: string;
    cached: boolean;
    exchanges: ExchangeReachabilityResult[];
}> {
    const now = Date.now();
    if (cache && cache.expiresAt > now) {
        return { checkedAt: cache.checkedAt, cached: true, exchanges: cache.exchanges };
    }

    const exchanges = await probeAllExchanges();
    const checkedAt = new Date().toISOString();
    cache = { exchanges, checkedAt, expiresAt: now + CACHE_TTL_MS };
    return { checkedAt, cached: false, exchanges };
}
