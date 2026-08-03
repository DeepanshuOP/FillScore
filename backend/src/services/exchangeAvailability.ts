export type AvailabilityReason = 'geo_block' | 'rate_limited' | 'timeout' | 'network_error' | 'other' | null;

export interface ExchangeAvailability {
    exchange: 'binance';
    reachable: boolean;
    httpStatus: number | null;
    latencyMs: number;
    checkedAt: string;
    reason: AvailabilityReason;
}

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 60_000;

function statusToReason(status: number): AvailabilityReason {
    if (status === 451) return 'geo_block';
    if (status === 418 || status === 429) return 'rate_limited';
    return 'other';
}

/**
 * Pings Binance server-side and reports reachability. Never throws — a Binance
 * failure is a successful response from us describing that failure.
 */
export async function probeBinanceAvailability(): Promise<ExchangeAvailability> {
    const start = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch('https://api.binance.com/api/v3/time', { signal: controller.signal });
    } catch (error: any) {
        clearTimeout(timer);
        const latencyMs = Math.round(performance.now() - start);
        const checkedAt = new Date().toISOString();

        if (error?.name === 'AbortError') {
            console.error(`[exchangeAvailability] Binance request timed out after ${TIMEOUT_MS}ms`);
            return { exchange: 'binance', reachable: false, httpStatus: null, latencyMs, checkedAt, reason: 'timeout' };
        }

        console.error(`[exchangeAvailability] Binance request failed: ${error?.name || 'Error'}`);
        return { exchange: 'binance', reachable: false, httpStatus: null, latencyMs, checkedAt, reason: 'network_error' };
    }
    clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);
    const checkedAt = new Date().toISOString();

    if (response.ok) {
        return { exchange: 'binance', reachable: true, httpStatus: response.status, latencyMs, checkedAt, reason: null };
    }

    let bodyText = '';
    try {
        bodyText = (await response.text()).slice(0, 200);
    } catch {
        // Ignore body-read failures on an already-failed response
    }
    console.error(`[exchangeAvailability] Binance rejected: status=${response.status} body=${bodyText}`);

    return {
        exchange: 'binance',
        reachable: false,
        httpStatus: response.status,
        latencyMs,
        checkedAt,
        reason: statusToReason(response.status),
    };
}

let cached: { result: ExchangeAvailability; expiresAt: number } | null = null;

/**
 * Cached wrapper around probeBinanceAvailability(), TTL 60s, so this endpoint
 * can't be used to hammer Binance regardless of client request rate.
 */
export async function getBinanceAvailability(): Promise<ExchangeAvailability> {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.result;
    }
    const result = await probeBinanceAvailability();
    cached = { result, expiresAt: now + CACHE_TTL_MS };
    return result;
}
