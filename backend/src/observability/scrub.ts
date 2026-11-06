// Sentry event scrubber (pure). Nothing sensitive may leave the process in an error event:
// request bodies, Authorization, cookies, any field named like a key/secret/token/password/uri,
// exchange API key payloads and connection-string values. Mirrors ml-service/observability/scrub.py.
export const SENSITIVE_KEY = /key|secret|token|password|passphrase|passwd|uri|authorization|cookie|credential/i;
const URI_VALUE = /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|amqp):\/\/\S+/gi;
const BEARER = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
export const FILTERED = '[Filtered]';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const QUERY = /(?<=\S)\?[^\s#"']+/g; // URL query strings carry tokens / OAuth codes

export function scrubValue(node: unknown): unknown {
    if (typeof node === 'string') {
        return node.replace(URI_VALUE, FILTERED).replace(BEARER, FILTERED).replace(EMAIL, FILTERED)
            .replace(QUERY, `?${FILTERED}`);
    }
    if (Array.isArray(node)) return node.map(scrubValue);
    if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            out[k] = SENSITIVE_KEY.test(k) ? FILTERED : scrubValue(v);
        }
        return out;
    }
    return node;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function beforeSend<T extends Record<string, any>>(event: T): T | null {
    const e: Record<string, any> = { ...event };
    if (e.request && typeof e.request === 'object') {
        const { data: _data, cookies: _cookies, query_string: _qs, ...rest } = e.request;
        e.request = rest;
    }
    delete e.user; // no identity leaves; ids reach logs only as a hash
    return scrubValue(e) as T;
}
