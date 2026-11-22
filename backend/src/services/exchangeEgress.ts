import axios, { AxiosRequestConfig } from 'axios';

/**
 * Outbound guard for every server request to an exchange (fourth order, step 4a).
 *
 * Helmet's Content-Security-Policy protects browsers from what a page may load; it does nothing for what this server
 * sends. This guard is the server side: an exchange client may only call the hosts listed here, over https, on the
 * default port, with no credentials in the URL, and a redirect is never followed (so a compromised or misconfigured
 * upstream cannot bounce a signed request, which carries the API key header, to another host). A refusal happens
 * before any request is made.
 *
 * The list is the set of hosts the code talks to today:
 *  - api.binance.com: spot REST (trades, account, klines); data-api.binance.vision: public market data
 *    (https://developers.binance.com/docs/binance-spot-api-docs/rest-api/general-api-information, "base endpoints")
 *  - api.bybit.com (v5 REST) and api.bytick.com (Bybit's alternative domain, probed by ExchangeReachability)
 *  - www.okx.com (v5 REST)
 */
export const ALLOWED_EXCHANGE_HOSTS = ['api.binance.com', 'data-api.binance.vision', 'api.bybit.com', 'api.bytick.com', 'www.okx.com'] as const;

export type EgressRefusal = 'host_not_allowed' | 'not_https' | 'bad_url' | 'redirect_refused';

export class ExchangeEgressError extends Error {
    constructor(public code: EgressRefusal, detail: string) {
        super(`Exchange egress refused (${code}): ${detail}`);
        this.name = 'ExchangeEgressError';
    }
}

export interface EgressPolicy {
    hosts: readonly string[];
    protocols: readonly string[];
    /** Tests only: allow an explicit port (a loopback server). The production policy never sets it. */
    allowPorts?: boolean;
}

export const DEFAULT_POLICY: EgressPolicy = { hosts: ALLOWED_EXCHANGE_HOSTS, protocols: ['https:'] };

/** The parsed URL if it may be requested under the policy; otherwise throws ExchangeEgressError (nothing was sent). */
export function assertAllowedUrl(url: string, policy: EgressPolicy = DEFAULT_POLICY): URL {
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        throw new ExchangeEgressError('bad_url', 'not an absolute URL');
    }
    if (!policy.protocols.includes(u.protocol)) throw new ExchangeEgressError('not_https', `scheme ${u.protocol}`);
    if (!policy.hosts.includes(u.hostname.toLowerCase())) throw new ExchangeEgressError('host_not_allowed', u.hostname);
    if (u.username || u.password) throw new ExchangeEgressError('bad_url', 'credentials in the URL');
    if (u.port && !policy.allowPorts) throw new ExchangeEgressError('bad_url', 'non-default port');
    return u;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the default mirrors axios.get, whose callers read untyped JSON
export interface ExchangeHttp {
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<{ data: T; status: number; headers: Record<string, unknown> }>;
}

type Transport = { get: (url: string, config?: AxiosRequestConfig) => Promise<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * An axios client for one exchange base URL. The base is checked when the client is built and every request URL
 * (relative or absolute) is checked before it is handed to axios; redirects are switched off (`maxRedirects: 0`), so a
 * 3xx answer is an error and no second request is made. `create` is injectable for tests; production uses axios.create.
 */
export function createExchangeHttp(
    baseURL: string,
    config: AxiosRequestConfig = {},
    policy: EgressPolicy = DEFAULT_POLICY,
    create: (cfg: AxiosRequestConfig) => Transport = (cfg) => axios.create(cfg),
): ExchangeHttp {
    assertAllowedUrl(baseURL, policy);
    const transport = create({ ...config, baseURL, maxRedirects: 0 });
    return {
        async get(url, cfg) {
            assertAllowedUrl(new URL(url, baseURL).href, policy);
            return transport.get(url, cfg);
        },
    };
}

/** fetch with the same rules: checked first, `redirect: 'manual'`, and a 3xx answer is refused instead of followed. */
export async function guardedFetch(
    url: string,
    init: RequestInit = {},
    policy: EgressPolicy = DEFAULT_POLICY,
    fetchImpl: typeof fetch = (...a) => globalThis.fetch(...a),
): Promise<Response> {
    assertAllowedUrl(url, policy);
    const res = await fetchImpl(url, { ...init, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
        throw new ExchangeEgressError('redirect_refused', `HTTP ${res.status} from ${new URL(url).hostname}`);
    }
    return res;
}
