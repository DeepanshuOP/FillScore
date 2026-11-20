/**
 * Break-ui pass (orders of 2026-11-20): the worst realistic data enters at the API mock boundary (the same place the
 * demo fixtures do), never in markup. Variants: worst (long client order ids, a 14-character symbol, an 8-figure
 * notional, a dust quantity, missing order type and maker flag), empty, one order, and a keyboard-only drawer cycle.
 * Needs a production build on QA_BASE (default 3101).   npx tsx e2e-shots/break.ts
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/qa/break')
mkdirSync(OUT, { recursive: true })
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base: any = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/demo-moderate.json'), 'utf8'))

type Variant = 'worst' | 'empty' | 'one'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function build(v: Variant): any {
  const f = structuredClone(base)
  if (v === 'empty') {
    f.trades = { ...f.trades, trades: [], total: 0, pages: 1 }
    f.ordersBody = { ...f.ordersBody, orders: { total: 0, filled: 0, partial: 0, unfilled: 0, open: 0 }, shortfall: { ...f.ordersBody.shortfall, n: 0 }, unfilled: { n: 0, medianOpportunityBps: null } }
    f.replays = {}
  }
  if (v === 'one') {
    f.trades = { ...f.trades, trades: f.trades.trades.slice(0, 1), total: 1, pages: 1 }
    f.ordersBody = { ...f.ordersBody, orders: { total: 1, filled: 1, partial: 0, unfilled: 0, open: 0 }, shortfall: { ...f.ordersBody.shortfall, n: 1 } }
  }
  if (v === 'worst') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = f.trades.trades as any[]
    const long = 'web_1f9a0c7e5b2d4c3a8e6f0b1d2c3a4e5f'            // a 36-character client order id
    const old = `${t[0].symbol}:${t[0].orderId}`
    t[0] = { ...t[0], symbol: '1000000MOGUSDT', orderId: long, notional: 48213774.55, notionalValue: 48213774.55, quantity: 0.00000012, executionPrice: 1234567.89, feeUsd: 12345.67 }
    t[1] = { ...t[1], orderType: null, isMaker: null, orderId: null }  // no order id: no replay
    if (f.replays[old]) { f.replays[`1000000MOGUSDT:${long}`] = f.replays[old] }
  }
  return f
}

async function mock(page: Page, f: ReturnType<typeof build>) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname.replace(/^.*\/api/, '')
    if (p === '/auth/refresh') return route.fulfill(json({ error: 'no session' }, 401))
    if (p === '/analytics/event') return route.fulfill({ status: 204 })
    if (p === '/audit/score') return route.fulfill(json({ userId: 'demo-moderate', period: { start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }, exchange: 'binance', totalTrades: 0, totalNotional: 0, avgFillScore: f.v1.score, fillGrade: f.v1.grade, breakdown: { avgSlippageBps: 0, makerRatio: 0, bestHour: 0, bestSymbol: 'BTCUSDT', worstSymbol: 'ETHUSDT', componentMeans: null }, v1Computed: false, current: f.current }))
    if (p === '/audit/v2') return route.fulfill(json(f.v2Body))
    if (p === '/audit/orders-summary') return route.fulfill(json(f.ordersBody))
    if (p === '/audit/trades') return route.fulfill(json(f.trades))
    if (p === '/audit/exceptions') return route.fulfill(json(f.explain.exceptions))
    if (p === '/audit/rankings') return route.fulfill(json(f.explain.rankings))
    if (p === '/audit/venue-comparison') return route.fulfill(json(f.explain.venues))
    const m = p.match(/^\/audit\/orders\/([^/]+)\/replay$/)
    if (m) { const r = f.replays[`${url.searchParams.get('symbol')}:${decodeURIComponent(m[1])}`]; return route.fulfill(r ? json(r) : json({ error: 'not found' }, 404)) }
    return route.fulfill(json({ error: 'not mocked' }, 404))
  })
  await page.route('**/health', (r) => r.fulfill(json({ status: 'ok' })))
}

async function spill(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const wide: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('main *, [role=dialog] *')) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) continue
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.children.length === 0 && getComputedStyle(el).display !== 'inline') wide.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? '').slice(0, 30)}"`)
      else if (r.right > vw + 1 && !el.closest('[class*="overflow-x-auto"]')) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} right=${Math.round(r.right)}`)
    }
    return { pageOverflow: document.documentElement.scrollWidth - vw, wide: wide.slice(0, 6) }
  })
}

async function main() {
  const b = await chromium.launch()
  const log: unknown[] = []
  const widths: Array<[string, number, number]> = [['1440', 1440, 900], ['390', 390, 844], ['320', 320, 640], ['zoom200', 720, 450]]
  for (const v of ['worst', 'empty', 'one'] as Variant[]) {
    for (const [wn, w, h] of widths) {
      for (const view of ['orders', 'overview'] as const) {
        const ctx = await b.newContext({ viewport: { width: w, height: h } })
        const page = await ctx.newPage()
        await mock(page, build(v))
        await page.goto(`${BASE}/dashboard?userId=demo-moderate${view === 'orders' ? '&view=orders' : ''}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500)
        if (view === 'orders' && v !== 'empty') {
          await page.locator('tbody tr').first().click().catch(() => undefined)
          await page.waitForTimeout(1200)
        }
        await page.screenshot({ path: resolve(OUT, `${v}-${view}-${wn}.jpg`), type: 'jpeg', quality: 55 })
        log.push({ v, view, w: wn, ...(await spill(page)) })
        await ctx.close()
      }
    }
  }
  // keyboard only: Tab to the first order row, Enter opens the drawer, focus is inside it, Escape closes and returns focus
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await mock(page, build('worst'))
  await page.goto(`${BASE}/dashboard?userId=demo-moderate&view=orders`, { waitUntil: 'networkidle' })
  await page.locator('tbody tr').first().waitFor()
  let reached = ''
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? `${a.tagName}|${a.closest('tbody') ? 'in-tbody' : ''}|${(a.textContent ?? '').slice(0, 24)}` : '' })
    if (reached.includes('in-tbody')) break
  }
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  const opened = await page.evaluate(() => ({ dialog: !!document.querySelector('[role=dialog]'), inside: !!document.activeElement?.closest('[role=dialog]') }))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  const back = await page.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? `${a.tagName}|${a.closest('tbody') ? 'in-tbody' : ''}` : '' })
  log.push({ keyboard: { reachedRow: reached, opened, afterEscape: back } })
  await b.close()
  console.log(JSON.stringify(log.filter((x) => { const o = x as { pageOverflow?: number; wide?: string[]; keyboard?: unknown }; return o.keyboard || o.pageOverflow || o.wide?.length }), null, 1))
}
void main()
