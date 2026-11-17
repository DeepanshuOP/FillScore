import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'
import { reshapeDemoAsRebuilt } from './db'

// M2 closing task (decision 11, option A). demo-aggressive is reshaped, in the local e2e database only, into what the
// M2 seed produces: trades with no per-trade v1 fields, plus orders and order measurements. The real backend and the
// real pages then answer. Every v1-only view must say "not computed for this data" (never 0), and the measured views
// (v2 components, order outcomes, resting time, shortfall, unfilled orders) must be shown.
const ID = 'demo-aggressive'

test.beforeAll(async () => { await reshapeDemoAsRebuilt(ID) })

test('dashboard of a rebuilt demo: v1-only views say "not computed", measured views are shown', async ({ page }) => {
  await page.goto(`/dashboard?userId=${ID}`)
  await expect(page.getByTestId('score-v1-label')).toBeVisible({ timeout: 30_000 })

  // v1-only views
  await expect(page.getByTestId('est-cost-not-computed')).toHaveText(/not computed for this data/i)
  const notComputed = page.getByTestId('not-computed')
  await expect(notComputed.first()).toBeVisible()
  expect(await notComputed.count()).toBeGreaterThanOrEqual(3)     // component scores, cost breakdown, venue/coach
  await expect(page.getByTestId('est-cost-not-computed')).not.toContainText('$')   // never a made-up zero cost

  // measured views
  await expect(page.getByTestId('score-v2')).toContainText(/Measured score/i)
  const orders = page.getByTestId('orders-panel')
  await expect(orders).toBeVisible()
  await expect(orders).toContainText('Orders: 5')
  await expect(orders).toContainText('Filled: 3')
  await expect(orders).toContainText('Unfilled: 1')
  await expect(page.getByTestId('orders-resting')).toContainText('Median 3.0 s')
  await expect(page.getByTestId('orders-shortfall')).toContainText('Execution cost: 2.0 bps')
  await expect(page.getByTestId('orders-unfilled')).toContainText('7.0 bps')

  expect(findAdviceTerms(await orders.innerText())).toEqual([])
})

// Live-site review of the rebuilt demo (2026-11-14), items 1 to 4 and 6, against the real backend and pages.
test('header cards come from the current fills and orders, not from the stored v1 audit', async ({ page }) => {
  await page.goto(`/dashboard?userId=${ID}`)
  await expect(page.getByTestId('score-v1-label')).toBeVisible({ timeout: 30_000 })
  // 3 fills of $420 in 5 orders, none a maker fill (reshapeDemoAsRebuilt)
  await expect(page.getByText('FILLS ANALYSED')).toBeVisible()
  await expect(page.getByTestId('header-trades')).toHaveText('3')
  await expect(page.getByTestId('header-trades-sub')).toHaveText('in 5 orders')
  await expect(page.getByTestId('header-volume')).toHaveText('$1,260.00')
  await expect(page.getByTestId('header-maker')).toContainText('0% of fills')
  await expect(page.getByText('TRADES ANALYSED')).toHaveCount(0)
  // item 6: the card that links to the trades table no longer promises per-trade scores
  await expect(page.getByText('See every fill')).toBeVisible()
  await expect(page.getByText(/Per-trade scores not computed for this data/)).toBeVisible()
  await expect(page.getByText('Sortable table · Per-trade scores · Full breakdown')).toHaveCount(0)
})

test('no negative zero; totals per term in USD and bps; grammar of the unfilled note', async ({ page }) => {
  await page.goto(`/dashboard?userId=${ID}`)
  const orders = page.getByTestId('orders-panel')
  await expect(orders).toBeVisible({ timeout: 30_000 })
  const text = await orders.innerText()
  expect(text).not.toMatch(/-0\.0 bps|-\$0\.00/)
  await expect(page.getByTestId('orders-shortfall')).toContainText('Impact and timing: >-0.01 bps')
  // hand values (see reshapeDemoAsRebuilt): execution $2 + $8 + $0 = $10 over $35,000 = 2.9 bps; fees $30 = 8.6 bps;
  // unfilled orders 7 bps x $5,000 = $3.50 over $35,000 = 1.0 bps; total $2.50 + $9 + $3.50 = $15 = 4.3 bps
  const totals = page.getByTestId('orders-totals')
  await expect(totals).toContainText('Execution cost: $10.00 · 2.9 bps')
  await expect(totals).toContainText('Spread paid: $3.00 · 1.0 bps')
  await expect(totals).toContainText('Fees: $30.00 · 8.6 bps')
  await expect(totals).toContainText('Unfilled orders: $3.50 · 1.0 bps')
  await expect(totals).toContainText('Total: $15.00 · 4.3 bps')
  await expect(totals).toContainText('Impact and timing: >-$0.01 · >-0.01 bps')
  // one unfilled order in this fixture: "its"
  await expect(page.getByTestId('orders-unfilled')).toContainText('its median cost')
})

test('v2.3.0 panel: dollar costs beside the letter, components named after the shortfall terms, timing as information', async ({ page }) => {
  await page.goto(`/dashboard?userId=${ID}`)
  const v2 = page.getByTestId('score-v2')
  await expect(v2).toBeVisible({ timeout: 30_000 })
  // hand values of reshapeDemoAsRebuilt: execution $10.00 (2.9 bps), unfilled orders $3.50 (1.0 bps), fees $30.00 (8.6 bps), total $15.00 (4.3 bps)
  const costs = page.getByTestId('score-v2-costs')
  await expect(costs).toBeVisible()
  await expect(costs).toContainText('Execution cost: $10.00 · 2.9 bps')
  await expect(costs).toContainText('Unfilled orders: $3.50 · 1.0 bps')
  await expect(costs).toContainText('Fees: $30.00 · 8.6 bps')
  await expect(costs).toContainText('Total: $15.00 · 4.3 bps')
  const text = await v2.innerText()
  for (const name of ['Execution cost', 'Fees', 'Unfilled orders']) expect(text).toContain(name)
  expect(text).not.toMatch(/Slippage|Spread:/)                  // the old component names are gone from the panel
  await expect(page.getByTestId('score-v2-timing')).toHaveText('Timing, not scored: No material difference between hours.')
  // M3 §2: cost vs expected beside the letter, past tense, with its interval (numbers come from the offline build; the pattern is checked, not the values)
  await expect(page.getByTestId('score-v2-cost-vs-expected')).toHaveText(
    /^Market orders cost -?[\d.]+ bps against -?[\d.]+ bps, the modelled cost of a taker event of the same size in the hour before the order \(fitted on January 2024\) \(difference [+-]?[\d.]+ bps; 90% interval [+-]?[\d.]+ bps to [+-]?[\d.]+ bps, a bootstrap over orders that leaves out the model's own error; \d+ orders\)\.$/)
})

test('M4 panel on a rebuilt demo: insufficient data for the queue, "too few to tell" in the rankings, no review controls, offline-build badge', async ({ page }) => {
  await page.goto(`/dashboard?userId=${ID}`)
  const panel = page.getByTestId('explain-panel')
  await expect(panel).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('explain-queue-note')).toContainText(/^Insufficient data: fewer than 20 measured orders/)
  await expect(page.getByTestId('explain-rankings')).toContainText('too few to tell')
  await expect(panel.getByRole('button', { name: /Mark reviewed|Dismiss|Reopen/ })).toHaveCount(0)     // a demo account is read-only
  await expect(page.getByTestId('score-v2-badge')).toHaveText('Offline build, hash recorded')
  const text = await panel.innerText()
  expect(text).not.toMatch(/\bshould\b|\bbecause\b|\bcaused by\b/i)
})

test('analytics of a rebuilt demo says not computed instead of drawing empty charts', async ({ page }) => {
  await page.goto(`/analytics?userId=${ID}`)
  await expect(page.getByTestId('not-computed')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('not-computed')).toContainText(/not computed for this data/i)
})

test('trades list of a rebuilt demo shows no slippage figure that was never computed', async ({ page }) => {
  await page.goto(`/trades?userId=${ID}`)
  await expect(page.getByText('TAKER').first()).toBeVisible({ timeout: 30_000 })    // a trade row has rendered
  await expect(page.getByTestId('trades-avg-score')).toHaveText('—')                 // never "0"
  const res = await page.request.get(`http://localhost:3001/api/audit/trades?userId=${ID}`)
  const body = await res.json()
  expect(body.v1Computed).toBe(false)
  for (const t of body.trades) expect(t.slippageBps).toBeNull()
})
