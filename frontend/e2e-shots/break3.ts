/**
 * Break-ui for the design v3 fixes (2026-11-21): worst-case data at the API mock boundary, never in markup.
 *   receipt-worst:    a 64-character order id, a 14-character symbol, 40 fills, an 8-figure cost and a tiny negative
 *   receipt-unfilled: an unfilled order with no measurement (the receipt's "insufficient data" path)
 *   council-worst:    a 1,600-character finding with a 90-character unbroken token, 25 cited values with long field paths,
 *                     and a note whose values could not be traced
 * Each at 1440, 390 and 320 px: viewport JPEG (quality 60) in .work/qa3/break/ and the DOM checks of mock.ts.
 *   npx tsx e2e-shots/break3.ts   (production server on QA_BASE, default :3101)
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, fx, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/qa3/break')
mkdirSync(OUT, { recursive: true })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const f: any = fx['demo-moderate']
const LONG_ID = `web_${'9f3a'.repeat(15)}`                       // 64 characters
const SYM = '1000SATSFDUSDT'                                      // 14 characters

function ledger(variant: 'worst' | 'unfilled') {
  const l = structuredClone(f.ledger)
  const row = l.orders[0]
  if (variant === 'worst') Object.assign(row, { orderId: LONG_ID, symbol: SYM, key: `binance|${SYM}|${LONG_ID}`, fills: 40, notionalUsd: 48213774.55, cost: { usd: 12345678.91, bps: 2560.4 } })
  else Object.assign(row, { orderId: 'unfilled-x', key: 'binance|BTCUSDT|unfilled-x', symbol: 'BTCUSDT', status: 'CANCELED', fills: 0, quantity: 0, notionalUsd: 0, feesUsd: null, makerShare: null, firstFill: null, lastFill: null, cost: null })
  return l
}
function replay(variant: 'worst' | 'unfilled') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = structuredClone((Object.values(f.replays) as Array<{ fills: unknown[] }>).find((x) => x.fills.length > 1))
  if (variant === 'worst') {
    r.order = { ...r.order, orderId: LONG_ID, symbol: SYM }
    const fill = r.fills[0]
    r.fills = Array.from({ length: 40 }, (_, i) => ({ ...fill, time: new Date(Date.parse(fill.time) + i * 37).toISOString(), quantity: 1234567.12345678, price: 0.0000123456 }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.decomposition = r.decomposition.map((d: any) => (d.key === 'total' || d.label === 'Total' ? { ...d, usd: 12345678.91, bps: 2560.4 } : d.label === 'Spread paid' ? { ...d, usd: -0.0004, bps: -0.0021 } : d))
  } else {
    r.order = { ...r.order, orderId: 'unfilled-x', symbol: 'BTCUSDT', status: 'CANCELED', executedQuantity: 0 }
    r.fills = []; r.decomposition = []; r.expectedCost = null; r.sources = []
    r.notes = ['Insufficient data: this order has no stored measurement.']
  }
  return r
}

const LONG_FINDING = `The account executed 76 market fills and 268 limit fills. ${'The note goes on in recorded words that a reviewer must still be able to read on a narrow phone without the page widening. '.repeat(10)}${'x'.repeat(90)}`
function councilOver(page: Page) {
  // the recorded run with a long finding, and a trace with 25 lines on one note and an untraceable one on another
  return page.route('**/ml/agents/council/stream', async (route) => {
    const { readFileSync } = await import('node:fs')
    const run = JSON.parse(readFileSync(resolve(__dirname, '../../ml-service/demo_runs/demo-moderate.json'), 'utf8')).council_result
    run.liquidity.slippageRoot = LONG_FINDING
    const lines = Array.from({ length: 25 }, (_, i) => ({ value: `$${(i * 1234.5).toFixed(2)}`, unit: 'USD',
      fields: [`liquidity.evidence_counts.a_very_long_packet_field_name_number_${i}_that_goes_on`, 'liquidity.other_field'] }))
    const cited = { liquidity_scout: { recorded: 25, lines, complete: true }, risk_auditor: { recorded: 4, lines: [], complete: false },
      fee_optimizer: { recorded: 3, lines: [], complete: true }, alpha_architect: { recorded: 1, lines: [], complete: true } }
    await route.fulfill({ status: 200, contentType: 'text/event-stream',
      body: `event: cited_values\ndata: ${JSON.stringify({ citedValues: cited })}\n\nevent: complete\ndata: ${JSON.stringify({ ...run, cached: true })}\n\n` })
  })
}

async function main() {
  const b = await chromium.launch()
  const results: unknown[] = []
  for (const width of [1440, 390, 320]) {
    for (const name of ['receipt-worst', 'receipt-unfilled', 'council-worst'] as const) {
      const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } })
      const page = await ctx.newPage()
      const variant = name === 'receipt-worst' ? 'worst' : 'unfilled'
      await mock(page, false, (p, url) => {
        if (name === 'council-worst') return undefined
        if (p === '/audit/orders-ledger') return ledger(variant)
        if (/^\/audit\/orders\/[^/]+\/replay$/.test(p) && url.searchParams.get('symbol')) return replay(variant)
        return undefined
      })
      if (name === 'council-worst') await councilOver(page)
      try {
        if (name === 'council-worst') {
          await page.goto(`${BASE}/dashboard?userId=demo-moderate&view=council`, { waitUntil: 'networkidle' })
          await page.getByRole('button', { name: 'Run analysis' }).click()
          await page.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 })
          await page.evaluate(() => document.querySelector('[data-testid=council-notes]')?.scrollIntoView({ block: 'start' }))
        } else {
          await page.goto(`${BASE}/dashboard?userId=demo-moderate&view=orders`, { waitUntil: 'networkidle' })
          await page.locator('[data-testid=orders-row]').first().click()
          await page.getByTestId('explain-replay').getByText(variant === 'worst' ? 'COSTS' : 'Insufficient data').first().waitFor({ timeout: 15000 })
        }
        await page.waitForTimeout(900)
        await page.screenshot({ path: resolve(OUT, `${name}-${width}.jpg`), type: 'jpeg', quality: 60 })
        results.push({ width, ...(await checks(page, name)) })
      } catch (e) {
        results.push({ width, name, error: String(e).slice(0, 200) })
      }
      await ctx.close()
    }
  }
  await b.close()
  for (const r of results) console.log(JSON.stringify(r).slice(0, 300))
}

void main()
