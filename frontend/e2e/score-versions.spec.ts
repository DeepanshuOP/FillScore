import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// M1: the dashboard labels the v1 grade "rule-based" and shows the measured score (v2) panel beside it. Demo accounts
// have no v2 score until M2 rebuilds them from real prints, so the panel says so instead of showing a number.
test('dashboard: v1 is labelled rule-based and the v2 panel states its demo status', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-moderate')
  // 2026-11-20 (dashboard rebuilt): the v1 grade is a labelled secondary line, "Rule-based score, grade X"; a demo's v2 grade
  // is served only from the offline build, so the headline carries the measured letter with its "Measured score" label.
  await expect(page.getByTestId('score-v1-label')).toContainText(/Rule-based score, grade [A-F]/, { timeout: 30_000 })
  // design v3.1: the v1 details are in the line's pen margin note
  await page.getByRole('button', { name: 'Note: the rule-based score' }).click()
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
