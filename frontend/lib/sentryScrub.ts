// Sentry event scrubber (pure) for the browser. Mirrors backend/src/observability/scrub.ts:
// request bodies, Authorization, cookies, key/secret/token/password/uri-named fields, exchange API key
// payloads and connection strings never leave the browser in an error event.
export const SENSITIVE_KEY = /key|secret|token|password|passphrase|passwd|uri|authorization|cookie|credential/i
const URI_VALUE = /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis|amqp):\/\/\S+/gi
const BEARER = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi
export const FILTERED = '[Filtered]'
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const QUERY = /(?<=\S)\?[^\s#"']+/g // URL query strings carry tokens / OAuth codes

export function scrubValue(node: unknown): unknown {
  if (typeof node === 'string') {
    return node.replace(URI_VALUE, FILTERED).replace(BEARER, FILTERED).replace(EMAIL, FILTERED)
      .replace(QUERY, `?${FILTERED}`)
  }
  if (Array.isArray(node)) return node.map(scrubValue)
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? FILTERED : scrubValue(v)
    }
    return out
  }
  return node
}

export function beforeSend<T extends Record<string, any>>(event: T): T | null {
  const e: Record<string, any> = { ...event }
  if (e.request && typeof e.request === 'object') {
    const { data: _d, cookies: _c, query_string: _q, ...rest } = e.request
    e.request = rest
  }
  delete e.user
  return scrubValue(e) as T
}
