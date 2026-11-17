// Security review (M9, finding 6): the frontend sent no security headers, so the Settings page (delete account, create an API key, connect an
// exchange) could be framed by another site (clickjacking). The headers below are the ones that cannot break the app: no script-source
// policy is set here (Next.js inlines scripts; a script policy needs nonces and is a separate piece of work).
import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config.mjs';

describe('frontend security headers', () => {
  it('every path carries frame-ancestors none, X-Frame-Options, nosniff, a referrer policy and a permissions policy', async () => {
    if (!nextConfig.headers) throw new Error('next.config.mjs defines no headers()');
    const rules = await nextConfig.headers();
    const all = rules.find((r: { source: string }) => r.source === '/:path*');
    if (!all) throw new Error('no header rule for every path');
    const h = Object.fromEntries(all.headers.map((x: { key: string; value: string }) => [x.key.toLowerCase(), x.value]));
    expect(h['content-security-policy']).toBe("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
});
