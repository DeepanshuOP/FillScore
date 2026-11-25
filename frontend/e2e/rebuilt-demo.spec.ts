import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'
import { reshapeDemoAsRebuilt } from './db'

// M2 closing task (decision 11, option A). demo-aggressive is reshaped, in the local e2e database only, into what the
// M2 seed produces: trades with no per-trade v1 fields, plus orders and order measurements. The real backend and the
// real pages then answer. Every v1-only view must say "not computed for this data" (never 0), and the measured views
// (headline, order outcomes, shortfall, unfilled orders) must be shown.
//
// Design v5 (2026-11-25): the nine facts below were asserted on the v4 Overview, queue, rankings and Patterns layouts. Each is
// asserted again on the v5 page that now shows it, with the same hand values:
//   Costs (/app/costs): the four tiles, "Where the cost came from", By order type, the grade card, "What this covers".
//   Orders (/app/orders), Fills (/app/fills), Flagged orders (/app/flagged), Comparisons (/app/compare), Reports (/app/reports).
// Facts that v5 no longer shows (resting-time medians, the pen margin notes, the Patterns tab) are not asserted as present; the
// Patterns tab is asserted absent in the last two specs and in markout-card.spec.ts.
const ID = 'demo-aggressive'

test.beforeAll(async () => { await reshapeDemoAsRebuilt(ID) })

// IA v4 (sixth order): the overview moved from /dashboard to /app/overview; design v5: it is /app/costs.
test('dashboard of a rebuilt demo: v1-only views say "not computed", measured views are shown', async ({ page }) => {
  await page.goto(`/app/costs?userId=${ID}`)
  await expect(page.getByTestId('home-total')).toBeVisible({ timeout: 30_000 })

  // the headline never makes up a figure: the total is the measured total of the orders (hand value, see below)
  // (3 of the 5 orders carry a measured total: one was not measured and one did not fill; the tile says "3 orders")
  await expect(page.getByTestId('home-total')).toContainText('$15.00')
  await expect(page.getByTestId('home-total')).toContainText('3 orders')

  // v1-only views: the rule-based details say so, inside their disclosure on Reports
  await page.goto(`/app/reports?userId=${ID}`)
  await page.getByRole('button', { name: 'Show the rule-based components' }).click()
  const notComputed = page.getByTestId('not-computed')
  await expect(notComputed).toBeVisible()
  await expect(notComputed).toContainText(/not computed for this data/i)

  // measured views: the orders table lists the 5 stored orders by status (3 filled, 2 cancelled, one of them with a modelled cost)
  await page.goto(`/app/orders?userId=${ID}`)
  const view = page.getByTestId('orders-view')
  await expect(view).toBeVisible({ timeout: 30_000 })
  // (rows with no stored order, the 3 fills that belong to no stored order, say "No stored order" and are not counted)
  const rows = page.getByTestId('orders-row')
  await expect(rows.filter({ hasText: 'Filled' })).toHaveCount(3)
  await expect(rows.filter({ hasText: 'Cancelled' })).toHaveCount(2)
  // execution cost of the two measured limit orders (hand values: 2.5 bps of $10,000 = $2.50; 4.5 bps of $20,000 = $9.00) and the
  // unfilled order's modelled cost (7 bps of $5,000 = $3.50), which the page says nobody paid
  await expect(view).toContainText('$2.50')
  await expect(view).toContainText('2.5 bps')
  await expect(view).toContainText('$9.00')
  await expect(view).toContainText('4.5 bps')
  await expect(view).toContainText('$3.50')
  await expect(view).toContainText('modelled, not paid')
  // the orders that carry no measured total say "not computed", never a zero
  // (the table rows; the phone cards carry the same words and are hidden at this width)
  await expect(rows.filter({ hasText: 'not computed' }).first()).toBeVisible()

  expect(findAdviceTerms(await view.innerText())).toEqual([])
})

// Live-site review of the rebuilt demo (2026-11-14), items 1 to 4 and 6, against the real backend and pages.
test('the scope facts come from the current fills and orders, not from the stored v1 audit', async ({ page }) => {
  await page.goto(`/app/costs?userId=${ID}`)
  await expect(page.getByTestId('home-total')).toBeVisible({ timeout: 30_000 })
  // 3 fills of $420 in 5 orders, none a maker fill (reshapeDemoAsRebuilt)
  const facts = page.getByTestId('scope-facts')
  // A5: the orders are those with fills, from the server's orderCounts: the 3 fills are in 3 orders (the 5 stored orders have none)
  await expect(facts).toContainText(/Fills\s*3, in 3 orders/)
  await expect(facts).toContainText(/Value traded\s*\$1,260\.00/)
  await expect(facts).toContainText(/Maker share of fills\s*0%/)
  await expect(page.getByText('TRADES ANALYSED')).toHaveCount(0)
})

test('no negative zero; totals per term in USD and bps; grammar of the unfilled note', async ({ page }) => {
  await page.goto(`/app/costs?userId=${ID}`)
  await expect(page.getByTestId('home-total')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('cost-breakdown')).toBeVisible()
  for (const [path, ready] of [['/app/costs', 'costs-view'], ['/app/orders', 'orders-view']] as const) {
    await page.goto(`${path}?userId=${ID}`)
    await expect(page.getByTestId(ready)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('main')).toContainText(/\$\d/)
    const text = await page.locator('main').innerText()
    expect(text, path).not.toMatch(/-0\.0 bps|−0\.0 bps|-\$0\.00|−\$0\.00/)
  }
  await page.goto(`/app/costs?userId=${ID}`)
  // hand values (see reshapeDemoAsRebuilt): execution $2 + $8 + $0 = $10 over $35,000 = 2.9 bps; fees $30 = 8.6 bps;
  // unfilled orders 7 bps x $5,000 = $3.50 over $35,000 = 1.0 bps; total $2.50 + $9 + $3.50 = $15 = 4.3 bps
  await expect(page.getByTestId('home-total')).toContainText('$15.00')
  await expect(page.getByTestId('home-total')).toContainText('4.3 bps')
  await expect(page.getByTestId('tile-fees')).toContainText('$30.00')
  await expect(page.getByTestId('tile-unfilled')).toContainText('$3.50')
  // the three parts of the strip add up to the total: the execution part is the remainder, 15.00 - 30.00 - 3.50 = -18.50, and a
  // negative part says so in words and is not drawn as a bar
  const strip = page.getByTestId('cost-breakdown')
  await expect(strip).toContainText('Fees')
  await expect(strip).toContainText('$30.00')
  await expect(strip).toContainText('Unfilled orders (modelled)')
  await expect(strip).toContainText('$3.50')
  await expect(strip).toContainText('−$18.50')
  await expect(strip).toContainText('not drawn: no positive cost')
  // totals by order type: three limit orders, fees $30.00, unfilled $3.50, execution $2 + $8 = $10.00
  const row = page.getByRole('row', { name: /^Limit orders/ })
  await expect(row).toContainText('3')
  await expect(row).toContainText('$30.00')
  await expect(row).toContainText('$3.50')
  await expect(row).toContainText('$10.00')
  // one unfilled order in this fixture: the singular
  await expect(page.getByTestId('tile-unfilled')).toContainText('1 order that never filled')
})

test('headline and record: dollar total, the cost sentence, components named after the shortfall terms, timing as information', async ({ page }) => {
  await page.goto(`/app/costs?userId=${ID}`)
  // hand values of reshapeDemoAsRebuilt: total $15.00 (4.3 bps) over the 3 orders that carry a measured total
  const total = page.getByTestId('home-total')
  await expect(total).toBeVisible({ timeout: 30_000 })
  await expect(total).toContainText('$15.00')
  await expect(page.getByTestId('scope-facts')).toContainText('3 orders in the total, 4.3 bps of their value.')
  // M3 §2: cost against expected, with its interval (numbers come from the offline build; the pattern is checked, not the values)
  const estimate = page.getByTestId('cost-estimate')
  await expect(estimate).toContainText('Paid')
  await expect(estimate).toContainText('Cost estimate')
  await expect(estimate).toContainText(/Difference [<>]?[−+\d.]+ bps, 90% interval [<>]?[−+\d.]+ bps to [<>]?[−+\d.]+ bps, \d+ market orders\./)
  // the record behind the grade, inside its disclosure on Reports
  await page.goto(`/app/reports?userId=${ID}`)
  await page.getByRole('button', { name: 'Components, version and integrity hash' }).click()
  const v2 = page.getByTestId('score-v2')
  await expect(v2).toBeVisible()
  const text = await v2.innerText()
  for (const name of ['Execution cost', 'Fees', 'Unfilled orders']) expect(text).toContain(name)
  expect(text).not.toMatch(/Slippage|Spread:/)                  // the old component names are gone from the panel
  await expect(page.getByTestId('score-v2-timing')).toHaveText('Timing, not scored: No material difference between hours.')
})

// design v2: the queue, the rankings and the record are separate sections; design v5: Flagged orders, Comparisons, Reports.
// Every assertion of the old combined panel is kept, each on its page.
test('M4 panel on a rebuilt demo: insufficient data for the queue, "too few to tell" in the rankings, no review controls, offline-build badge', async ({ page }) => {
  await page.goto(`/app/flagged?userId=${ID}`)
  const rules = page.getByTestId('explain-panel')
  await expect(rules).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('explain-queue-note')).toContainText(/^Insufficient data: fewer than 20 measured orders/)
  await expect(rules.getByRole('button', { name: /Mark reviewed|Dismiss|Reopen/ })).toHaveCount(0)     // a demo account is read-only
  expect(await rules.innerText()).not.toMatch(/\bshould\b|\bbecause\b|\bcaused by\b/i)

  await page.goto(`/app/compare?userId=${ID}`)
  // v5 wording of "too few to tell": the group is listed under "Too few orders to compare" with its count (3 orders, floor 20)
  await expect(page.getByTestId('compare-too-few')).toContainText('Too few orders to compare (fewer than 20)', { timeout: 30_000 })
  await expect(page.getByTestId('compare-too-few')).toContainText('BTCUSDT: 3 orders')
  expect(await page.getByTestId('explain-panel').innerText()).not.toMatch(/\bshould\b|\bbecause\b|\bcaused by\b/i)

  await page.goto(`/app/reports?userId=${ID}`)
  await expect(page.getByTestId('score-v2-badge')).toHaveText('Offline build, hash recorded', { timeout: 30_000 })
})

test('analytics of a rebuilt demo says not computed instead of drawing empty charts', async ({ page }) => {
  // design v5, PROPOSAL §4 row 3 (class a): the Patterns tab and its "not computed" page are gone for accounts that never have the
  // v1 per-fill data. The old address opens Fills; no empty chart and no Patterns tab are drawn, and the research views are
  // stated once, in Methodology (asserted in markout-card.spec.ts).
  await page.goto(`/analytics?userId=${ID}`)
  await expect(page).toHaveURL(/\/app\/fills\?userId=demo-aggressive/, { timeout: 30_000 })
  await expect(page.getByText('TAKER').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: /Patterns/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Patterns/ })).toHaveCount(0)
  await expect(page.getByTestId('not-computed')).toHaveCount(0)
  await expect(page.locator('canvas, svg.recharts-surface')).toHaveCount(0)
})

test('trades list of a rebuilt demo shows no slippage figure that was never computed', async ({ page }) => {
  await page.goto(`/app/fills?userId=${ID}`)
  await expect(page.getByText('TAKER').first()).toBeVisible({ timeout: 30_000 })    // a trade row has rendered
  // A2 (2026-11-23) kept the "not computed" line; design v5 (PROPOSAL §4 row 1, class a) drops it with the columns: a measure that
  // no fill of this account has is neither a column nor a sentence (never a "0")
  await expect(page.getByTestId('trades-avg-score')).toHaveCount(0)
  await expect(page.getByTestId('fills-not-computed')).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Slippage' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Score' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Grade' })).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: /Time \(UTC\)/i })).toBeVisible()
  const res = await page.request.get(`http://localhost:3001/api/audit/trades?userId=${ID}`)
  const body = await res.json()
  expect(body.v1Computed).toBe(false)
  for (const t of body.trades) expect(t.slippageBps).toBeNull()
})
