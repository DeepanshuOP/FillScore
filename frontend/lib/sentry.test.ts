import { describe, it, expect, vi } from 'vitest'

const { init } = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ init }))

import { beforeSend, FILTERED } from './sentryScrub'
import { initSentry } from './sentryInit'

describe('frontend Sentry scrubber', () => {
  it('removes bodies, cookies, auth headers, secret-named fields, exchange payloads, URIs and identity', () => {
    const e: any = beforeSend({
      request: {
        url: 'http://x', data: { apiKey: 'AK' }, cookies: { sid: '1' }, query_string: 'token=a',
        headers: { Authorization: 'Bearer a.b', Cookie: 'sid=1', Accept: 'json' },
      },
      user: { email: 'a@b.c' },
      extra: { apiSecret: 'S', passphrase: 'P', MONGODB_URI: 'mongodb://u:p@h/x', msg: 'at mongodb://u:p@h/x', n: 3 },
    })
    expect(e.request.data).toBeUndefined()
    expect(e.request.cookies).toBeUndefined()
    expect(e.request.query_string).toBeUndefined()
    expect(e.request.headers).toEqual({ Authorization: FILTERED, Cookie: FILTERED, Accept: 'json' })
    expect(e.user).toBeUndefined()
    expect(e.extra).toEqual({ apiSecret: FILTERED, passphrase: FILTERED, MONGODB_URI: FILTERED, msg: `at ${FILTERED}`, n: 3 })
  })
})

it('removes URL query strings and emails inside values', () => {
  const e: any = beforeSend({ request: { url: 'http://x/reset-password?token=abc123' }, msg: 'dup { email: "bob@x.com" }' })
  expect(e.request.url).toBe(`http://x/reset-password?${FILTERED}`)
  expect(e.msg).not.toContain('bob@x.com')
})

describe('frontend initSentry', () => {
  it('is skipped without a DSN', () => {
    expect(initSentry(undefined)).toBe(false)
    expect(initSentry('  ')).toBe(false)
    expect(init).not.toHaveBeenCalled()
  })
  it('initialises PII-off with the scrubber when a DSN is set', () => {
    expect(initSentry('https://k@o0.ingest.sentry.io/1')).toBe(true)
    expect(init.mock.calls[0][0].sendDefaultPii).toBe(false)
    expect(init.mock.calls[0][0].beforeSend).toBe(beforeSend)
  })
})
