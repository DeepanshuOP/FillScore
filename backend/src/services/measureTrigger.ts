import jwt from 'jsonwebtoken';
import * as Sentry from '@sentry/node';

/**
 * After a sync, ask the ml-service to measure the account's pending fills and orders (measurement v2, M1 Part B).
 *
 * Outbox (ADR-0011): the trade rows are the queue. A trade without a measurement for the current version is
 * pending, so if this call fails or the process dies, the next sync (or the next successful call) measures it.
 * Nothing here needs a transaction, and a repeated call is harmless (the ml job is idempotent).
 *
 * Auth: a short-lived token signed on the JWT_ACCESS_SECRET both services already hold, with typ "measure" and the
 * account id. The ml-service accepts it only on /internal/measure; it is never accepted as a user token. No new
 * credential is needed. The base URL comes from ML_SERVICE_URL; without it the call is skipped.
 */
export const MEASURE_TOKEN_TTL_S = 120;
export const MAX_ATTEMPTS = 5;
export const FIRST_BACKOFF_MS = 30_000;
export const MAX_CALLS = 20;

export function mintMeasureToken(accountId: string, secret: string, nowS = Math.floor(Date.now() / 1000)): string {
    return jwt.sign({ typ: 'measure', accountId, iat: nowS, exp: nowS + MEASURE_TOKEN_TTL_S }, secret, { algorithm: 'HS256' });
}

export interface MeasureOptions {
    baseUrl?: string;
    secret: string;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    report?: (e: unknown) => void;
}

export type MeasureResult =
    | { status: 'skipped'; calls: 0 }
    | { status: 'done'; calls: number; measured: number; pending: number }
    | { status: 'dead'; calls: number; measured: number; reason: string };

/** One POST to an ml-service /internal/* route for `accountId`, with a fresh measure token. Throws when not
 *  configured (`ml_not_configured`) or unreachable; returns the Response otherwise. */
export async function callMlInternal(path: string, accountId: string, opts: { baseUrl?: string; secret: string; fetchImpl?: typeof fetch }): Promise<Response> {
    if (!opts.baseUrl) throw new Error('ml_not_configured');
    return (opts.fetchImpl ?? fetch)(`${opts.baseUrl.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintMeasureToken(accountId, opts.secret)}` },
        body: JSON.stringify({ accountId }),
    });
}

/** After measurement: score the account under Scoring v2. Never rejects; a failure is reported and the next sync
 *  scores again. */
export async function requestScore(accountId: string, opts: MeasureOptions): Promise<'skipped' | 'done' | 'failed'> {
    if (!opts.baseUrl) return 'skipped';
    try {
        const res = await callMlInternal('/internal/score-v2', accountId, opts);
        if (!res.ok) throw new Error(`ml_http_${res.status}`);
        return 'done';
    } catch (e) {
        (opts.report ?? (err => Sentry.captureException(err, { tags: { job: 'score_v2' } })))(e);
        return 'failed';
    }
}

/** Never rejects: it runs unawaited after a sync, and an unhandled rejection would kill Node 20. */
export async function requestMeasurement(accountId: string, opts: MeasureOptions): Promise<MeasureResult> {
    if (!opts.baseUrl) return { status: 'skipped', calls: 0 };
    const url = `${opts.baseUrl.replace(/\/+$/, '')}/internal/measure`;
    const doFetch = opts.fetchImpl ?? fetch;
    const sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    const report = opts.report ?? (e => Sentry.captureException(e, { tags: { job: 'measure_v2' } }));
    let calls = 0, measured = 0, attempts = 0, lastReason = '';
    try {
        while (calls < MAX_CALLS) {
            let body: { measured?: number; pending?: number } | null = null;
            try {
                calls++;
                const res = await doFetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintMeasureToken(accountId, opts.secret)}` },
                    body: JSON.stringify({ accountId }),
                });
                if (!res.ok) throw new Error(`ml_http_${res.status}`);
                body = await res.json();
            } catch (e: any) {
                attempts++;
                lastReason = String(e?.message ?? e);
                if (attempts >= MAX_ATTEMPTS) {
                    report(new Error(`measure_v2 gave up after ${attempts} attempts: ${lastReason}`));
                    return { status: 'dead', calls, measured, reason: lastReason };
                }
                await sleep(FIRST_BACKOFF_MS * 2 ** (attempts - 1));
                continue;
            }
            attempts = 0;
            const m = Number(body?.measured ?? 0), pending = Number(body?.pending ?? 0);
            measured += m;
            // Stop when nothing is left, or when a call made no progress (fills that must wait, e.g. too recent).
            if (pending <= 0 || m <= 0) return { status: 'done', calls, measured, pending };
        }
        return { status: 'done', calls, measured, pending: -1 };
    } catch (e: any) {
        return { status: 'dead', calls, measured, reason: String(e?.message ?? e) };
    }
}
