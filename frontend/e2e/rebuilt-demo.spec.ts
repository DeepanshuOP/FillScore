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
