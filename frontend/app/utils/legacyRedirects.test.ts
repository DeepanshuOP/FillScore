import { describe, it, expect } from 'vitest'
import { legacyRedirects } from '../../legacyRedirects.mjs'

/**
 * The redirect table (IA v4, step 1). `resolve` applies Next's documented semantics: the first row whose source equals the
 * path and whose `has` query conditions all match wins; the incoming query is forwarded and merged with the destination's own.
 * The behaviour of the real server is checked in e2e/legacy-redirects.spec.ts.
 */
function resolve(url: string): string | null {
  const u = new URL(url, 'http://x')
  for (const r of legacyRedirects) {
    if (r.source !== u.pathname) continue
    if (!(r.has ?? []).every((h) => u.searchParams.get(h.key) !== null && new RegExp(`^(?:${h.value})$`).test(u.searchParams.get(h.key)!))) continue
    const [path, own] = r.destination.split('?')
    // measured against `next start` (step 1): the incoming parameters come first, then the destination's own
    const q = new URLSearchParams(u.searchParams)
    for (const [k, v] of new URLSearchParams(own ?? '')) if (!q.has(k)) q.set(k, v)
    const s = q.toString()
    return s ? `${path}?${s}` : path
  }
  return null
}

describe('legacy redirects', () => {
  it('every redirect is permanent (308)', () => {
    expect(legacyRedirects.length).toBeGreaterThan(0)
    for (const r of legacyRedirects) expect(r.permanent).toBe(true)
  })

  it.each([
    ['/dashboard', '/app'],
    ['/dashboard?view=overview', '/app/overview?view=overview'],
    ['/dashboard?view=orders', '/app/orders?view=orders'],
    ['/dashboard?view=rules', '/app/rules?view=rules'],
    ['/dashboard?view=rankings', '/app/rankings?view=rankings'],
    ['/dashboard?view=council', '/app/council?view=council'],
    ['/dashboard?view=evidence', '/app/evidence?view=evidence'],
    ['/dashboard?view=nonsense', '/app?view=nonsense'],
    ['/trades', '/app/fills'],
    ['/analytics', '/app/fills?tab=patterns'],
    ['/check', '/app/check'],
    ['/settings', '/app/settings'],
    ['/onboarding', '/app/connect'],
  ])('%s -> %s', (from, to) => {
    expect(resolve(from)).toBe(to)
  })

  it('keeps the rest of the query: demo id, sample, symbol and order', () => {
    expect(resolve('/dashboard?userId=demo-moderate')).toBe('/app?userId=demo-moderate')
    expect(resolve('/dashboard?view=orders&userId=demo-moderate&order=ord-moderate-BTCUSDT-319184'))
      .toBe('/app/orders?view=orders&userId=demo-moderate&order=ord-moderate-BTCUSDT-319184')
    expect(resolve('/dashboard?userId=demo-aggressive&sample=1&view=council')).toBe('/app/council?userId=demo-aggressive&sample=1&view=council')
    expect(resolve('/trades?userId=demo-disciplined&symbol=ETHUSDT')).toBe('/app/fills?userId=demo-disciplined&symbol=ETHUSDT')
    // the destination's own tab is kept and the incoming query is merged after it
    expect(resolve('/analytics?userId=demo-moderate&sample=1')).toBe('/app/fills?userId=demo-moderate&sample=1&tab=patterns')
  })

  it('the six dashboard sections each have a row, and a section name inside another value does not match', () => {
    expect(legacyRedirects.filter((r) => r.source === '/dashboard' && r.has).map((r) => r.has![0].value))
      .toEqual(['overview', 'orders', 'rules', 'rankings', 'council', 'evidence'])
    expect(resolve('/dashboard?view=ordersX')).toBe('/app?view=ordersX')
  })

  it('addresses that did not move are not redirected', () => {
    for (const p of ['/', '/verify', '/methodology', '/login', '/share/demo-moderate', '/app', '/app/orders']) expect(resolve(p)).toBeNull()
  })
})
