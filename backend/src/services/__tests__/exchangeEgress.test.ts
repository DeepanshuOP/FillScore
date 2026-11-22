import http from 'http';
import { AddressInfo } from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ALLOWED_EXCHANGE_HOSTS,
    ExchangeEgressError,
    assertAllowedUrl,
    createExchangeHttp,
    guardedFetch,
    type EgressPolicy,
} from '../exchangeEgress';

describe('exchange egress guard: which URLs may leave the server', () => {
    it('lists exactly the configured exchange hosts', () => {
        expect([...ALLOWED_EXCHANGE_HOSTS].sort()).toEqual([
            'api.binance.com',
            'api.bybit.com',
            'api.bytick.com',
            'data-api.binance.vision',
            'www.okx.com',
        ]);
    });

    it('accepts an https URL on an allowed host, with a path and a query', () => {
        expect(assertAllowedUrl('https://api.binance.com/api/v3/myTrades?symbol=BTCUSDT').hostname).toBe('api.binance.com');
        expect(assertAllowedUrl('https://www.okx.com/api/v5/trade/fills-history').hostname).toBe('www.okx.com');
    });

    it.each([
        ['an unlisted host', 'https://evil.example.com/x', 'host_not_allowed'],
        ['a look-alike suffix', 'https://api.binance.com.evil.example/x', 'host_not_allowed'],
        ['a look-alike prefix', 'https://evilapi.binance.com/x', 'host_not_allowed'],
        ['a sub-domain that is not listed', 'https://x.api.binance.com/x', 'host_not_allowed'],
        ['plain http', 'http://api.binance.com/api/v3/time', 'not_https'],
        ['user info before the host', 'https://api.binance.com@evil.example/x', 'host_not_allowed'],
        ['credentials in the URL', 'https://user:pw@api.binance.com/x', 'bad_url'],
        ['a non-default port', 'https://api.binance.com:8443/x', 'bad_url'],
        ['an IP address', 'https://93.184.216.34/x', 'host_not_allowed'],
        ['a relative path', '/api/v3/time', 'bad_url'],
        ['another scheme', 'ftp://api.binance.com/x', 'not_https'],
    ])('refuses %s', (_why, url, code) => {
        expect(() => assertAllowedUrl(url)).toThrow(ExchangeEgressError);
        try {
            assertAllowedUrl(url);
        } catch (e) {
            expect((e as ExchangeEgressError).code).toBe(code);
        }
    });
});

describe('createExchangeHttp: refused before any request', () => {
    it('does not call the transport for a disallowed host (absolute URL under an allowed base)', async () => {
        const get = vi.fn();
        const http_ = createExchangeHttp('https://api.binance.com', {}, undefined, () => ({ get }));
        await expect(http_.get('https://evil.example.com/steal')).rejects.toMatchObject({ code: 'host_not_allowed' });
        expect(get).not.toHaveBeenCalled();
    });

    it('refuses a disallowed base URL when the client is built', () => {
        const get = vi.fn();
        expect(() => createExchangeHttp('https://evil.example.com', {}, undefined, () => ({ get }))).toThrow(ExchangeEgressError);
    });

    it('passes an allowed relative path to the transport with redirects switched off', async () => {
        const get = vi.fn().mockResolvedValue({ data: 1 });
        let created: Record<string, unknown> = {};
        const h = createExchangeHttp('https://api.binance.com', { timeout: 10000, headers: { 'X-MBX-APIKEY': 'k' } }, undefined, (cfg) => {
            created = cfg as Record<string, unknown>;
            return { get };
        });
        await h.get('/api/v3/time');
        expect(get).toHaveBeenCalledWith('/api/v3/time', undefined);
        expect(created.maxRedirects).toBe(0);
        expect(created.baseURL).toBe('https://api.binance.com');
        expect(created.timeout).toBe(10000);
    });
});

describe('guardedFetch', () => {
    it('does not call fetch for a disallowed host or for http', async () => {
        const f = vi.fn();
        await expect(guardedFetch('https://evil.example.com/x', {}, undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ code: 'host_not_allowed' });
        await expect(guardedFetch('http://api.binance.com/x', {}, undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ code: 'not_https' });
        expect(f).not.toHaveBeenCalled();
    });

    it('asks fetch not to follow redirects and refuses a 3xx answer', async () => {
        const f = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://evil.example.com/' } }));
        await expect(guardedFetch('https://api.binance.com/x', { headers: { a: 'b' } }, undefined, f as unknown as typeof fetch)).rejects.toMatchObject({ code: 'redirect_refused' });
        expect(f).toHaveBeenCalledTimes(1);
        expect(f.mock.calls[0][1]).toMatchObject({ redirect: 'manual', headers: { a: 'b' } });
    });

    it('returns an ordinary answer unchanged', async () => {
        const ok = new Response('{"serverTime":1}', { status: 200 });
        const f = vi.fn().mockResolvedValue(ok);
        expect(await guardedFetch('https://api.binance.com/api/v3/time', {}, undefined, f as unknown as typeof fetch)).toBe(ok);
    });
});

// The real transport (axios over a socket): a redirect answer must never be followed to a second server.
describe('createExchangeHttp: a redirect is not followed (real sockets, local test policy)', () => {
    const servers: http.Server[] = [];
    afterEach(async () => {
        await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
    });
    const listen = (handler: http.RequestListener) =>
        new Promise<number>((resolve) => {
            const s = http.createServer(handler);
            servers.push(s);
            s.listen(0, '127.0.0.1', () => resolve((s.address() as AddressInfo).port));
        });

    it('stops at the 302 and makes no request to the host it points at', async () => {
        let targetHits = 0;
        const targetPort = await listen((_req, res) => {
            targetHits++;
            res.end('{"leaked":true}');
        });
        const sourcePort = await listen((_req, res) => {
            res.writeHead(302, { Location: `http://localhost:${targetPort}/secret` });
            res.end();
        });
        // test policy: plain http to loopback only; production's policy is the https exchange list above
        const policy: EgressPolicy = { hosts: ['127.0.0.1'], protocols: ['http:'], allowPorts: true };
        const client = createExchangeHttp(`http://127.0.0.1:${sourcePort}`, {}, policy);
        await expect(client.get('/start')).rejects.toMatchObject({ response: { status: 302 } });
        expect(targetHits).toBe(0);
    });
});
