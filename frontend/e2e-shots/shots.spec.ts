import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * M8 phase 2b, part 1 (2026-11-20): the production screens, as a reader sees them.
 *  - axe: 0 serious or critical violations on the dashboard, settings and an auth page, at 390 and 1440 px.
 *  - screenshots, only when SHOTS=<dir> is set: dashboard of demo-moderate and demo-disciplined, settings and login, at 390, 834 and 1440.
 * Every API call is answered here. The dashboard numbers are the output of the production `summariseOrders` over the
 * offline demo build (fixtures cut by cut-fixtures.ts); the Explain panel's queue and rankings are built from the same
 * measurements but are layout stand-ins, not the production rules. Nothing here reads or writes a database.
 */
const WIDTHS = [390, 834, 1440] as const
const SHOTS = process.env.SHOTS
type Fx = { ordersBody: unknown; v2Body: unknown; v1: { grade: string; score: number }; current: unknown; explain: { exceptions: unknown; rankings: unknown; venues: unknown } }
const fixture = (id: string): Fx => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', `${id}.json`), 'utf8'))
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mock(page: Page, opts: { demo?: string; signedIn?: boolean }) {
  const fx = opts.demo ? fixture(opts.demo) : null
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace(/^.*\/api/, '')
    if (p === '/auth/refresh') return route.fulfill(opts.signedIn ? json({ accessToken: 'shots-token' }) : json({ error: 'no session' }, 401))
    if (p === '/auth/me') return route.fulfill(json({ id: 'u1', email: 'trader@example.com', emailVerified: true }))
    if (p === '/analytics/event') return route.fulfill({ status: 204 })
    if (p === '/keys') return route.fulfill(json({ maxActive: 5, defaultExpiryDays: 90, keys: [
      { id: 'k1', name: 'Claude Desktop', prefix: 'fsk_7Hq2xa', scope: 'read', createdAt: '2026-10-02T09:00:00Z', expiresAt: '2027-01-01T09:00:00Z', lastUsedAt: '2026-11-18T12:00:00Z', revokedAt: null },
      { id: 'k2', name: 'Old laptop', prefix: 'fsk_Zp81Lm', scope: 'read', createdAt: '2026-08-01T09:00:00Z', expiresAt: '2026-11-01T09:00:00Z', lastUsedAt: null, revokedAt: null }] }))
    if (fx) {
      if (p === '/audit/score') return route.fulfill(json({
        userId: opts.demo, period: { start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }, exchange: 'binance',
        totalTrades: 0, totalNotional: 0, avgFillScore: fx.v1.score, fillGrade: fx.v1.grade,
        breakdown: { avgSlippageBps: 0, makerRatio: 0, bestHour: 0, bestSymbol: 'BTCUSDT', worstSymbol: 'ETHUSDT', componentMeans: null },
        v1Computed: false, current: fx.current }))
      if (p === '/audit/v2') return route.fulfill(json(fx.v2Body))
      if (p === '/audit/orders-summary') return route.fulfill(json(fx.ordersBody))
      if (p === '/audit/exceptions') return route.fulfill(json(fx.explain.exceptions))
      if (p === '/audit/rankings') return route.fulfill(json(fx.explain.rankings))
      if (p === '/audit/venue-comparison') return route.fulfill(json(fx.explain.venues))
    }
    return route.fulfill(json({ error: 'not mocked' }, 404))
  })
  // the model service: only a wake-up ping happens without a click
  await page.route('**/health', (r) => r.fulfill(json({ status: 'ok' })))
}

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
}

const SCREENS: Array<{ name: string; path: string; demo?: string; signedIn?: boolean; wait: string }> = [
  { name: 'dashboard-moderate', path: '/dashboard?userId=demo-moderate', demo: 'demo-moderate', wait: 'Where the' },
  { name: 'dashboard-disciplined', path: '/dashboard?userId=demo-disciplined', demo: 'demo-disciplined', wait: 'Where the' },
  // Signed in: the Ask, data-freshness and broker-file panels and the evidence buttons show. The demo fixture stands in for the
  // account's data here (the sync status is not mocked, so the freshness line is absent); the screenshot reviews layout.
  { name: 'dashboard-signedin', path: '/dashboard', demo: 'demo-moderate', signedIn: true, wait: 'Where the' },
  { name: 'settings', path: '/settings', signedIn: true, wait: 'Connected exchanges' },   // design v2: the page title is "Settings"
  { name: 'login', path: '/login', wait: 'Log in' },
]

test.describe('axe', () => {
  for (const s of SCREENS.filter((x) => x.name === 'dashboard-moderate' || x.name === 'settings' || x.name === 'login')) {
    for (const width of [390, 1440]) {
      test(`${s.name} at ${width}px: no serious or critical violation`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await mock(page, s)
        await page.goto(s.path)
        await expect(page.getByText(s.wait).first()).toBeVisible({ timeout: 30_000 })
        await ready(page)
        // no horizontal scroll: the page is never wider than the screen
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
      })
    }
  }
})

test.describe('screenshots', () => {
  test.skip(!SHOTS, 'set SHOTS=<dir> to write the screenshots')
  for (const s of SCREENS) {
    for (const width of WIDTHS) {
      test(`${s.name} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 })
        await mock(page, s)
        await page.goto(s.path)
        await expect(page.getByText(s.wait).first()).toBeVisible({ timeout: 30_000 })
        await ready(page)
        mkdirSync(SHOTS!, { recursive: true })
        await page.screenshot({ path: resolve(SHOTS!, `${s.name}-${width}.png`), fullPage: true })
        // the first screen, at full size: the part a reader sees before scrolling
        await page.screenshot({ path: resolve(SHOTS!, `${s.name}-${width}-top.png`) })
      })
    }
  }
})
