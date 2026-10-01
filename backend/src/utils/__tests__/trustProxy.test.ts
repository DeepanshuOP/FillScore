import { describe, it, expect } from 'vitest';
import { resolveTrustProxyHops } from '../trustProxy';

describe('resolveTrustProxyHops', () => {
    it('trusts nothing in development', () => {
        expect(resolveTrustProxyHops({})).toBe(0);
        expect(resolveTrustProxyHops({ NODE_ENV: 'development' })).toBe(0);
    });

    it('trusts one hop in production by default', () => {
        expect(resolveTrustProxyHops({ NODE_ENV: 'production' })).toBe(1);
    });

    it('trusts one hop when TRUST_PROXY is true or 1', () => {
        expect(resolveTrustProxyHops({ TRUST_PROXY: 'true' })).toBe(1);
        expect(resolveTrustProxyHops({ TRUST_PROXY: '1' })).toBe(1);
    });

    it('uses TRUST_PROXY_HOPS when it is a whole number from 1 to 5', () => {
        expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' })).toBe(2);
        expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '5' })).toBe(5);
    });

    it('ignores a bad TRUST_PROXY_HOPS value rather than trusting every hop', () => {
        expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })).toBe(1);
        expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '6' })).toBe(1);
        expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: 'true' })).toBe(1);
        expect(resolveTrustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '1.5' })).toBe(1);
        expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: 'abc' })).toBe(0);
    });
});
