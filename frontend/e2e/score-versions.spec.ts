import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// M1: the dashboard labels the v1 grade "rule-based" and shows the measured score (v2) panel beside it. Demo accounts
// have no v2 score until M2 rebuilds them from real prints, so the panel says so instead of showing a number.
test('dashboard: v1 is labelled rule-based and the v2 panel states its demo status', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-moderate')
  // 2026-11-20 (dashboard rebuilt): the v1 grade is a labelled secondary line, "Rule-based score, grade X"; a demo's v2 grade
  // is served only from the offline build, so the headline carries the measured letter with its "Measured score" label.
  // A4: with a measured grade the visible line is only "Graded A, 93.4 of 100." and the v1 grade is in the stamp's pen margin
  // note; without one (this e2e database has no v2 score for the demo) the v1 line and its own note stay (selectors only)
  const label = page.getByTestId('score-v1-label')
  await expect(label).toContainText(/Graded [A-F], \d+\.\d of 100\.|Rule-based score, grade [A-F]/, { timeout: 30_000 })
  const graded = /^Graded/.test(await label.innerText())
  await page.getByRole('button', { name: graded ? 'Note: the measured score' : 'Note: the rule-based score' }).click()
  if (graded) await expect(page.getByTestId('score-v1-detail')).toContainText(/The earlier rule-based grade, [A-F] \d+\.\d, scoring v1, kept unchanged/)
  await expect(page.getByTestId('score-v1-detail')).toContainText(/published grade of the earlier demo data/)
  const headline = page.getByTestId('headline')
  await expect(headline).toBeVisible()
  const text = await headline.innerText()
  expect(text).not.toMatch(/\b[A-F] · \d+ \/ 100/)          // no "A · 95 / 100" string
  expect(findAdviceTerms(text)).toEqual([])
})

test('methodology page renders the generated method and the scoring version', async ({ page }) => {
  await page.goto('/methodology')
  await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible()
  await expect(page.getByText('fill.effective_half_spread_bps', { exact: false })).toBeVisible()
  await expect(page.getByText(/Scoring v2\.\d+\.\d+/)).toBeVisible()   // design v2: sentence case, no uppercase labels
  expect(findAdviceTerms(await page.locator('main').innerText())).toEqual([])
})
