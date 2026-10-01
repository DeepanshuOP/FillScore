/**
 * How many reverse-proxy hops in front of the app to trust for X-Forwarded-For.
 * Returns 0 when none. Never returns "trust everything", because that lets a client
 * spoof its IP and walk around the rate limits.
 *
 * Behind Vercel (proxying /api) and then Render, there are two hops, so production
 * deploys of that shape set TRUST_PROXY_HOPS=2.
 */
export function resolveTrustProxyHops(vars: Record<string, string | undefined>): number {
    const raw = vars.TRUST_PROXY_HOPS;
    if (raw !== undefined && /^[1-5]$/.test(raw.trim())) {
        return parseInt(raw.trim(), 10);
    }
    if (vars.NODE_ENV === 'production' || vars.TRUST_PROXY === 'true' || vars.TRUST_PROXY === '1') {
        return 1;
    }
    return 0;
}
