import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'
import { reshapeDemoAsRebuilt } from './db'

// M1: the app labels the v1 grade "rule-based" and shows the measured score (v2) beside it. A demo's v2 grade is served only from
// the offline build, and only for an account that has measured orders; an account without them says so instead of showing a number.
// IA v4 (sixth order): the overview moved to /app/overview. Design v5 (2026-11-25): it is /app/costs, and the grade card prints the
// measured grade and, under it, the locked v1 grade in one line (data-testid v1-grade), instead of the v4 stamp's pen margin note.
//
// demo-aggressive is reshaped (as in rebuilt-demo.spec.ts) so that it has measured orders. Hand value of its measured grade: the
// offline build (ml-service/demo_v2/out/grades_v2.json) has composite 94.34969957374337, printed to one decimal as 94.3, letter A.
// The v1 line prints the grade of the v1 audit stored in this e2e database (seeded locally, so its number is not the published
// Atlas one; the published values are pinned by backend gradeInvariance.test.ts), so the pattern is asserted, not the number.
test.beforeAll(async () => { await reshapeDemoAsRebuilt('demo-aggressive') })

test('dashboard: v1 is labelled rule-based and the v2 panel states its demo status', async ({ page }) => {
  await page.goto('/app/costs?userId=demo-aggressive')
  const card = page.getByTestId('grade-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  // the measured grade, with its version and range
  await expect(card).toContainText('Graded A, 94.3 of 100.')
  await expect(card).toContainText('Score version 2.3.0.')
  await expect(card).toContainText(/Range from the measurement: \d+\.\d to \d+\.\d\./)
  // the v1 grade is labelled rule-based, locked, and "different things" (I4: a published grade is shown, never hidden)
  await expect(page.getByTestId('v1-grade')).toContainText(/^Earlier rule-based grade \(scoring v1, published and locked\): [A-F], \d+\.\d of 100\. The two scores measure different things; neither replaces the other\.$/)
  const text = await card.innerText()
  expect(text).not.toMatch(/\b[A-F] · \d+ \/ 100/)          // no "A · 95 / 100" string
  expect(findAdviceTerms(text)).toEqual([])

  // an account with no measured orders in this database states its status in words (never a made-up letter)
  await page.goto('/app/costs?userId=demo-moderate')
  const none = page.getByTestId('grade-card')
  await expect(none).toBeVisible({ timeout: 30_000 })
  await expect(none).toContainText('No measured grade yet')
  await expect(none).toContainText('The measured grade is computed after the orders are synced and measured.')
  await expect(page.getByTestId('v1-grade')).toHaveCount(0)
  expect(findAdviceTerms(await none.innerText())).toEqual([])
})

test('methodology page renders the generated method and the scoring version', async ({ page }) => {
  await page.goto('/methodology')
  await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible()
  await expect(page.getByText('fill.effective_half_spread_bps', { exact: false })).toBeVisible()
  await expect(page.getByText(/Scoring v2\.\d+\.\d+/)).toBeVisible()   // design v2: sentence case, no uppercase labels
  expect(findAdviceTerms(await page.locator('main').innerText())).toEqual([])
})
