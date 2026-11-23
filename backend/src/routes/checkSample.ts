import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { callMlInternal, mlServiceSecret } from '../services/measureTrigger';

/**
 * "Try the sample file" (A5, orders of 2026-11-23): POST /api/check/sample runs the committed sample broker file through the ml-service's
 * CSV check (`/internal/csv-sample`) for anyone, signed in or not, so a visitor can see what the check prints before choosing a file of
 * their own. The visitor sends nothing: the file is a constant of the ml-service, so nothing is stored here and no file content passes
 * through this process or its logs.
 *
 * Limits, through express-rate-limit like the other routes: 3 requests an hour per client IP, then 200 a day overall. The IP limit runs
 * first, so a refused IP does not use up the overall count. The client IP is `req.ip`, which depends on the app's trust-proxy setting
 * (`TRUST_PROXY_HOPS=2` on Render behind Vercel, `resolveTrustProxyHops`): with the right hop count a client cannot start a new count by
 * writing its own X-Forwarded-For. The ml-service's own gate (2 checks at once, a pause after a 418 or 429 from the market-data source)
 * and its single fixed Binance host apply to the market-data calls this makes; this process makes no exchange call of its own.
 */
export const SAMPLE_PER_IP_PER_HOUR = 3;
export const SAMPLE_PER_DAY = 200;
/** The account name on the service token: a label, never a user. The ml-service accepts only this one on the sample route. */
export const SAMPLE_ACCOUNT = 'sample-file';
const ML_TIMEOUT_MS = 90_000;

export interface CheckSampleOptions {
    perIp?: number;
    perDay?: number;
    baseUrl?: string;
    secret?: string;
    fetchImpl?: typeof fetch;
}

export function createCheckSampleRouter(opts: CheckSampleOptions = {}): Router {
    const router = Router();
    const ipLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: opts.perIp ?? SAMPLE_PER_IP_PER_HOUR,
        skipFailedRequests: true,    // a check that failed (a pause, a busy service, an unreachable ml-service) does not use one of the 3 tries
        message: { error: 'The sample file can be checked 3 times an hour. Try again later.', code: 'SAMPLE_IP_LIMIT' },
    });
    const dayLimiter = rateLimit({
        windowMs: 24 * 60 * 60 * 1000,
        max: opts.perDay ?? SAMPLE_PER_DAY,
        skipFailedRequests: true,
        keyGenerator: () => 'all',
        message: { error: 'The sample file has been checked as often as it can be today. Try again tomorrow.', code: 'SAMPLE_DAY_LIMIT' },
    });

    router.post('/sample', ipLimiter, dayLimiter, async (_req, res) => {
        const baseUrl = opts.baseUrl ?? process.env.ML_SERVICE_URL;
        const secret = opts.secret ?? mlServiceSecret();
        if (!baseUrl || !secret) {
            return res.status(503).json({ code: 'sample_unavailable', message: 'The sample file cannot be checked right now.' });
        }
        const base = opts.fetchImpl ?? fetch;
        const fetchImpl = ((url: Parameters<typeof fetch>[0], init?: RequestInit) =>
            base(url, { ...init, signal: AbortSignal.timeout(ML_TIMEOUT_MS) })) as typeof fetch;
        try {
            const r = await callMlInternal('/internal/csv-sample', SAMPLE_ACCOUNT, { baseUrl, secret, fetchImpl });
            const body = await r.json().catch(() => null) as { detail?: { code?: string; message?: string } } | null;
            if (r.ok) return res.status(200).json(body);
            const retry = r.headers.get('Retry-After');
            if (retry) res.set('Retry-After', retry);
            const d = body?.detail;
            return res.status(r.status === 429 || r.status === 503 ? r.status : 502).json({
                code: d?.code ?? 'sample_failed', message: d?.message ?? 'The sample file could not be checked.',
            });
        } catch {   // nothing about the cause is returned or logged
            return res.status(502).json({ code: 'sample_failed', message: 'The sample file could not be checked.' });
        }
    });
    return router;
}

export const checkSampleRouter = createCheckSampleRouter();
