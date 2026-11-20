/**
 * Design v2 visual QA (orders of 2026-11-20). One script, six states, two widths, viewport-only JPEGs (quality 60) in
 * .work/qa/, plus DOM checks: no horizontal overflow, no element wider than the viewport, no overlapping cards in the
 * overview bento, axe with 0 serious or critical issues, and the landing page's cumulative layout shift.
 *
 * Every API call is answered from the fixtures cut from the offline demo build (cut-fixtures.ts): no database, no network.
 * Run against a production build:  npm run build && PORT=3101 npm run start   then   npx tsx e2e-shots/qa.ts [pass]
 */
import { chromium, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const PASS = process.argv[2] ?? '1'
const OUT = resolve(__dirname, '../../.work/qa', `pass-${PASS}`)
mkdirSync(OUT, { recursive: true })

type Fx = { ordersBody: unknown; v2Body: unknown; v1: { grade: string; score: number }; current: unknown; trades: unknown; replays: Record<string, unknown>
  explain: { exceptions: unknown; rankings: unknown; venues: unknown } }
const fx: Record<string, Fx> = Object.fromEntries(['demo-moderate', 'demo-disciplined', 'demo-aggressive']
  .map((id) => [id, JSON.parse(readFileSync(resolve(__dirname, 'fixtures', `${id}.json`), 'utf8'))]))
const COUNCIL = JSON.parse(readFileSync(resolve(__dirname, '../../ml-service/demo_runs/demo-moderate.json'), 'utf8')).council_result
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mock(page: Page, signedIn: boolean) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace(/^.*\/api/, '')
    const id = url.searchParams.get('userId') ?? 'demo-moderate'
    const f = fx[id] ?? fx['demo-moderate']
    if (p === '/auth/refresh') return route.fulfill(signedIn ? json({ accessToken: 'qa-token' }) : json({ error: 'no session' }, 401))
    if (p === '/auth/me') return route.fulfill(json({ id: 'u1', email: 'trader@example.com', emailVerified: true }))
    if (p === '/analytics/event') return route.fulfill({ status: 204 })
    if (p === '/onboarding/connect') return route.fulfill(json({ error: 'key_not_read_only', disable: ['Enable Spot & Margin Trading', 'Enable Withdrawals'], enable: ['Enable Reading'] }, 400))
    if (p === '/keys') return route.fulfill(json({ maxActive: 5, defaultExpiryDays: 90, keys: [] }))
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
  // the Council: the committed recorded demo run, delivered as the one `complete` event the panel renders from
  await page.route('**/ml/agents/council/stream', (r) => r.fulfill({ status: 200, contentType: 'text/event-stream',
    body: `event: complete\ndata: ${JSON.stringify({ ...COUNCIL, cached: true })}\n\n` }))
  await page.route('**/ml/agents/council/budget**', (r) => r.fulfill(json({ remaining: 20, limit: 20 })))
}

async function checks(page: Page, name: string) {
  const dom = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const overflow = document.documentElement.scrollWidth - vw
    const wide: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const style = getComputedStyle(el)
      if (style.position === 'fixed' || style.visibility === 'hidden') continue
      // only elements whose own box spills past the viewport and that no ancestor clips
      if (r.right > vw + 1 || r.left < -1) {
        let clipped = false
        for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break } }
        if (!clipped) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      }
    }
    // the overview bento: no two cards overlap, and no card's content is wider than the card
    const cards = [...document.querySelectorAll<HTMLElement>('main .panel')].filter((c) => c.closest('[class*="grid-cols-12"]'))
    const overlaps: string[] = []
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].getBoundingClientRect(), b = cards[j].getBoundingClientRect()
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps.push(`${i}x${j}`)
    }
    const spill = cards.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.id || c.dataset.testid || 'card')
    return { overflow, wide: wide.slice(0, 8), overlaps, spill }
  })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)
  return { name, ...dom, axe: bad }
}

const STATES: Array<{ name: string; path: string; signedIn?: boolean; only1440?: boolean; only390?: boolean; light?: boolean; prepare: (p: Page) => Promise<void> }> = [
  { name: 'landing-hero', path: '/', prepare: async (p) => {
    await p.getByRole('button', { name: 'Skip' }).click({ timeout: 8000 }).catch(() => undefined)
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
    await p.waitForTimeout(900)
  } },
  { name: 'landing-story', path: '/', prepare: async (p) => {
    await p.getByRole('button', { name: 'Skip' }).click({ timeout: 8000 }).catch(() => undefined)
    await p.locator('[data-step="2"]').scrollIntoViewIfNeeded()
    await p.evaluate(() => { const el = document.querySelector('[data-step="2"]') as HTMLElement; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.3, behavior: 'instant' as ScrollBehavior }) })
    await p.waitForTimeout(1500)
  } },
  { name: 'overview', path: '/dashboard?userId=demo-moderate', prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'order-drawer', path: '/dashboard?userId=demo-moderate&view=orders', prepare: async (p) => {
    await p.locator('tbody tr').first().waitFor({ timeout: 30000 })
    await p.locator('tbody tr').first().click()
    await p.getByTestId('explain-replay').waitFor({ timeout: 15000 })
    await p.waitForTimeout(1200)
  } },
  { name: 'rankings', path: '/dashboard?userId=demo-moderate&view=rankings', prepare: async (p) => { await p.getByTestId('explain-rankings').waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'landing-menu', path: '/', only390: true, prepare: async (p) => {
    await p.getByRole('button', { name: 'Open menu' }).click()
    await p.getByRole('dialog').getByRole('link', { name: 'Check a broker file' }).waitFor({ timeout: 8000 }); await p.waitForTimeout(700)
  } },
  { name: 'council', path: '/dashboard?userId=demo-moderate&view=council', only1440: true, prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1200)
  } },
  { name: 'onboarding-refusal', path: '/onboarding', signedIn: true, only1440: true, prepare: async (p) => {
    await p.getByRole('button', { name: /Binance/ }).first().click()
    await p.getByLabel('API key', { exact: true }).fill('qa-demo-key'); await p.getByLabel('API secret', { exact: true }).fill('qa-demo-secret')
    await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Connect account' }).click()
    await p.getByText('The key was refused').waitFor({ timeout: 15000 }); await p.waitForTimeout(800)
  } },
  { name: 'overview-light', path: '/dashboard?userId=demo-moderate', only1440: true, light: true, prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'settings', path: '/settings', signedIn: true, prepare: async (p) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500) } },
]

async function landingCls(): Promise<number> {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await mock(page, false)
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(7000)   // the hero story plays through
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  await b.close()
  return cls
}

async function main() {
  const results: unknown[] = []
  const b = await chromium.launch()
  for (const width of [1440, 390]) {
    for (const s of STATES) {
      if ((s.only1440 && width !== 1440) || (s.only390 && width !== 390)) continue
      const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      if (s.light) await page.addInitScript(() => localStorage.setItem('theme', 'light'))
      await mock(page, !!s.signedIn)
      await page.goto(BASE + s.path, { waitUntil: 'networkidle', timeout: 60000 })
      await page.evaluate(() => document.fonts.ready)
      await s.prepare(page)
      await page.screenshot({ path: resolve(OUT, `${s.name}-${width}.jpg`), type: 'jpeg', quality: 60 })
      results.push({ width, ...(await checks(page, s.name)) })
      await ctx.close()
    }
  }
  await b.close()
  const cls = await landingCls()
  const report = { pass: PASS, landingCls: cls, results }
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 1))
  console.log(JSON.stringify(report, null, 1))
}

void main()
