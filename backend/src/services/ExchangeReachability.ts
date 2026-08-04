import axios from 'axios';

export type ExchangeName = 'binance' | 'binance-data' | 'bybit' | 'bybit-alt' | 'okx';

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
}

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

const PROBE_TARGETS: { exchange: ExchangeName; url: string }[] = [
    { exchange: 'binance', url: 'https://api.binance.com/api/v3/time' },
    { exchange: 'bybit', url: 'https://api.bybit.com/v5/market/time' },
    { exchange: 'okx', url: 'https://www.okx.com/api/v5/public/time' },
    { exchange: 'binance-data', url: 'https://data-api.binance.vision/api/v3/time' },
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
async function probeOne(exchange: ExchangeName, url: string): Promise<ExchangeReachabilityResult> {
    const start = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const timeoutGuard = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), TIMEOUT_MS);
    });

    try {
        const response = await Promise.race([
            axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true }),
            timeoutGuard,
        ]);
        clearTimeout(timer!);
        const { status, detail } = classifyStatus(response.status);
        return {
            exchange,
            status,
            httpStatus: response.status,
            latencyMs: Math.round(performance.now() - start),
            checkedAt: new Date().toISOString(),
            detail,
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
export async function probeAllExchanges(): Promise<ExchangeReachabilityResult[]> {
    const settled = await Promise.allSettled(PROBE_TARGETS.map(({ exchange, url }) => probeOne(exchange, url)));

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
