/**
 * Break-ui for design v3.1 "Quiet audit" (2026-11-21, second): worst-case data at the API mock boundary, never in markup.
 *   overview-long:  an 8-figure total ($12,345,678.91, 2,560.4 bps), a 9-figure fee part, 4 unmeasured orders, an
 *                   8-figure largest order on the tape, a price improvement larger than the costs on the strip
 *   overview-one:   one order (one bar, one tally stroke, a strip of one part)
 *   overview-empty: no orders stored (the summary says unavailable, the ledger is empty)
 * Each at 1440, 390, 320 px and at 200% zoom (a 720 x 450 viewport at device scale 2): viewport JPEGs (quality 60) of
 * every chapter in .work/qa3/break31/, and the DOM checks of mock.ts (overflow, overlaps, axe).
 *   npx tsx e2e-shots/break31.ts   (production server on QA_BASE, default :3101)
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, fx, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/qa3/break31')
mkdirSync(OUT, { recursive: true })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const f: any = fx['demo-moderate']

type Variant = 'long' | 'one' | 'empty'
function summary(v: Variant) {
  if (v === 'empty') return { available: false, reason: 'no_orders' }
  const s = structuredClone(f.ordersBody)
  if (v === 'long') {
    s.shortfall.unmeasured = 4
    s.shortfall.totals.total = { usd: 12345678.91, bps: 2560.4, n: 241 }
    s.shortfall.totals.fees = { usd: 123456789.12, bps: 25604.1, n: 241 }
    // the market part is a price improvement larger than the fees: no width, named apart
    // (111111110.21 / 123456789.12 = 0.9: drawn below the line at 90%; no unfilled part)
    s.strip = { totalUsd: 12345678.91, segments: [{ key: 'execution', usd: -111111110.21, share: 0, below: 0.9 }, { key: 'missed', usd: 0, share: 0, below: 0 }, { key: 'fees', usd: 123456789.12, share: 1, below: 0 }] }
  } else {
    s.orders = { total: 1, filled: 1, partial: 0, unfilled: 0, open: 0 }
    s.counts = { orders: 1, withFills: 1, fills: 2, unrecorded: 0 }
    s.shortfall.n = 1; s.shortfall.unmeasured = 0
    s.shortfall.totals.total = { usd: 0.25, bps: 10, n: 1 }
    s.shortfall.totals.fees = { usd: 0.25, bps: 10, n: 1 }
    s.strip = { totalUsd: 0.25, segments: [{ key: 'execution', usd: 0, share: 0, below: 0 }, { key: 'missed', usd: 0, share: 0, below: 0 }, { key: 'fees', usd: 0.25, share: 1, below: 0 }] }
    s.byType = { all: s.shortfall.totals, market: s.shortfall.totals, limit: null, other: null }
  }
  return s
}
function ledger(v: Variant) {
  const l = structuredClone(f.ledger)
  if (v === 'empty') return { available: true, counts: { orders: 0, withFills: 0, fills: 0, unrecorded: 0 }, orders: [] }
  if (v === 'one') { l.orders = [l.orders[0]]; l.counts = { orders: 1, withFills: 1, fills: 2, unrecorded: 0 }; return l }
  Object.assign(l.orders[5], { cost: { usd: 12345678.91, bps: 2560.4 }, notionalUsd: 48213774.55 })
  return l
}

async function shoot(page: Page, name: string) {
  const out: unknown[] = []
  await page.screenshot({ path: resolve(OUT, `${name}-top.jpg`), type: 'jpeg', quality: 60 })
  out.push(await checks(page, `${name}-top`))
  for (const n of [2, 3, 4, 5]) {
    const there = await page.evaluate((k) => { const el = document.querySelector(`[data-chapter="${k}"]`); if (!el) return false; window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 110); return true }, n)
    if (!there) continue
    await page.waitForTimeout(900)
    await page.screenshot({ path: resolve(OUT, `${name}-ch${n}.jpg`), type: 'jpeg', quality: 60 })
    out.push(await checks(page, `${name}-ch${n}`))
  }
  return out
}

async function main() {
  const b = await chromium.launch()
  const results: unknown[] = []
  const sizes: Array<[string, { width: number; height: number }, number]> = [['1440', { width: 1440, height: 900 }, 1], ['390', { width: 390, height: 844 }, 1], ['320', { width: 320, height: 640 }, 1], ['zoom200', { width: 720, height: 450 }, 2]]
  for (const v of ['long', 'one', 'empty'] as Variant[]) {
    for (const [label, viewport, dsf] of sizes) {
      const ctx = await b.newContext({ viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await mock(page, false, (p) => (p === '/audit/orders-summary' ? summary(v) : p === '/audit/orders-ledger' ? ledger(v) : undefined))
      try {
        await page.goto(BASE + '/dashboard?userId=demo-moderate', { waitUntil: 'networkidle', timeout: 60000 })
        await page.getByTestId('headline').waitFor({ timeout: 30000 }); await page.waitForTimeout(1200)
        results.push(...(await shoot(page, `overview-${v}-${label}`)))
      } catch (e) {
        results.push({ name: `overview-${v}-${label}`, error: String(e).slice(0, 200) })
      }
      await ctx.close()
    }
  }
  // Part B (2026-11-22, second): the Orders ledger with the same three data variants, the Council after a run and the
  // broker-file Check page, at the same four sizes (one viewport capture each: the first screen is where they break)
  const extra: Array<[string, Variant | null, string, (p: Page) => Promise<void>]> = [
    ['orders-long', 'long', '/dashboard?userId=demo-moderate&view=orders', async (p) => { await p.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 }) }],
    ['orders-one', 'one', '/dashboard?userId=demo-moderate&view=orders', async (p) => { await p.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 }) }],
    ['orders-empty', 'empty', '/dashboard?userId=demo-moderate&view=orders', async (p) => { await p.getByText('No orders yet').waitFor({ timeout: 30000 }) }],
    ['council-run', null, '/dashboard?userId=demo-moderate&view=council', async (p) => {
      await p.getByRole('button', { name: 'Run analysis' }).click(); await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }) }],
    ['check', null, '/check', async (p) => { await p.waitForLoadState('networkidle') }],
  ]
  for (const [name, v, path, ready] of extra) {
    for (const [label, viewport, dsf] of sizes) {
      const ctx = await b.newContext({ viewport, deviceScaleFactor: dsf, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await mock(page, false, (p) => (v && p === '/audit/orders-summary' ? summary(v) : v && p === '/audit/orders-ledger' ? ledger(v) : undefined))
      try {
        await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
        await ready(page); await page.waitForTimeout(1000)
        await page.screenshot({ path: resolve(OUT, `${name}-${label}.jpg`), type: 'jpeg', quality: 60 })
        results.push(await checks(page, `${name}-${label}`))
      } catch (e) {
        results.push({ name: `${name}-${label}`, error: String(e).slice(0, 200) })
      }
      await ctx.close()
    }
  }
  await b.close()
  for (const r of results as Array<Record<string, unknown>>) {
    const bad = r.error || r.overflow || (r.wide as unknown[])?.length || (r.overlaps as unknown[])?.length || (r.axe as unknown[])?.length
    console.log(`${bad ? 'BAD' : 'ok '} ${JSON.stringify(r).slice(0, 260)}`)
  }
}

void main()
