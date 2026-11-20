/**
 * Shared API stand-ins for the design QA scripts (design v3, 2026-11-20): every call is answered from the fixtures cut
 * from the offline demo build (cut-fixtures.ts) and the committed recorded Council run. No database, no network.
 */
import type { Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Fx = { ordersBody: unknown; v2Body: unknown; v1: { grade: string; score: number }; current: unknown; trades: unknown; replays: Record<string, unknown>
  explain: { exceptions: unknown; rankings: unknown; venues: unknown } }
export const fx: Record<string, Fx> = Object.fromEntries(['demo-moderate', 'demo-disciplined', 'demo-aggressive']
  .map((id) => [id, JSON.parse(readFileSync(resolve(__dirname, 'fixtures', `${id}.json`), 'utf8'))]))
const COUNCIL = JSON.parse(readFileSync(resolve(__dirname, '../../ml-service/demo_runs/demo-moderate.json'), 'utf8')).council_result
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

export async function mock(page: Page, signedIn: boolean, over: (p: string, url: URL) => unknown = () => undefined) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace(/^.*\/api/, '')
    const custom = over(p, url)
    if (custom !== undefined) return route.fulfill(json(custom))
    const id = url.searchParams.get('userId') ?? 'demo-moderate'
    const f = fx[id] ?? fx['demo-moderate']
    if (p === '/auth/refresh') return route.fulfill(signedIn ? json({ accessToken: 'qa-token' }) : json({ error: 'no session' }, 401))
    if (p === '/auth/me') return route.fulfill(json({ id: 'u1', email: 'trader@example.com', emailVerified: true }))
    if (p === '/analytics/event') return route.fulfill({ status: 204 })
    if (p === '/onboarding/connect') return route.fulfill(json({ error: 'key_not_read_only', disable: ['Enable Spot & Margin Trading', 'Enable Withdrawals'], enable: ['Enable Reading'] }, 400))
    if (p === '/keys') return route.fulfill(json({ maxActive: 5, defaultExpiryDays: 90, keys: [
      { id: 'k1', name: 'Claude Desktop', prefix: 'fsk_7Hq2xa', scope: 'read', createdAt: '2026-10-02T09:00:00Z', expiresAt: '2027-01-01T09:00:00Z', lastUsedAt: '2026-11-18T12:00:00Z', revokedAt: null }] }))
    if (p === '/audit/score') return route.fulfill(json({
      userId: id, period: { start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }, exchange: 'binance', totalTrades: 0, totalNotional: 0,
      avgFillScore: f.v1.score, fillGrade: f.v1.grade, breakdown: { avgSlippageBps: 0, makerRatio: 0, bestHour: 0, bestSymbol: 'BTCUSDT', worstSymbol: 'ETHUSDT', componentMeans: null },
      v1Computed: false, current: f.current }))
    if (p === '/audit/v2') return route.fulfill(json(f.v2Body))
    if (p === '/audit/orders-summary') return route.fulfill(json(f.ordersBody))
    if (p === '/audit/trades') return route.fulfill(json(f.trades))
    if (p === '/audit/exceptions') return route.fulfill(json(f.explain.exceptions))
    if (p === '/audit/rankings') return route.fulfill(json(f.explain.rankings))
    if (p === '/audit/venue-comparison') return route.fulfill(json(f.explain.venues))
    const m = p.match(/^\/audit\/orders\/([^/]+)\/replay$/)
    if (m) {
      const r = f.replays[`${url.searchParams.get('symbol')}:${decodeURIComponent(m[1])}`]
      return route.fulfill(r ? json(r) : json({ error: 'not found' }, 404))
    }
    return route.fulfill(json({ error: 'not mocked' }, 404))
  })
  await page.route('**/health', (r) => r.fulfill(json({ status: 'ok' })))
  await page.route('**/ml/agents/council/stream', (r) => r.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: complete\ndata: ${JSON.stringify({ ...COUNCIL, cached: true })}\n\n` }))
  await page.route('**/ml/agents/council/budget**', (r) => r.fulfill(json({ remaining: 20, limit: 20 })))
}

/** DOM checks: horizontal overflow, elements past the viewport, overlapping text boxes, axe serious/critical. */
export async function checks(page: Page, name: string) {
  const dom = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const overflow = document.documentElement.scrollWidth - vw
    const wide: string[] = []
    const texts: Array<{ r: DOMRect; t: string }> = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.position === 'fixed' || style.visibility === 'hidden' || style.opacity === '0') continue
      if (r.right > vw + 1 || r.left < -1) {
        let clipped = false
        for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break } }
        if (!clipped) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      }
      // leaf text boxes inside the first two screens, for the overlap check
      // (text inside a fixed or sticky layer, such as the top bar, is drawn over the page on purpose and is left out)
      let layered = false
      for (let a: HTMLElement | null = el; a; a = a.parentElement) { const pos = getComputedStyle(a).position; if (pos === 'fixed' || pos === 'sticky') { layered = true; break } }
      if (!layered && r.top < window.innerHeight * 2 && el.children.length === 0 && (el.textContent ?? '').trim().length > 1 && !el.closest('[aria-hidden="true"],svg,.sr-only,[data-overlap-ok]')) texts.push({ r, t: (el.textContent ?? '').trim().slice(0, 24) })
    }
    const overlaps: string[] = []
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i].r, b = texts[j].r
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ix > 4 && iy > 4) overlaps.push(`${texts[i].t} x ${texts[j].t}`)
    }
    return { overflow, wide: wide.slice(0, 8), overlaps: overlaps.slice(0, 8) }
  })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
  return { name, ...dom, axe: bad }
}
