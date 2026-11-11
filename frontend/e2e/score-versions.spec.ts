import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// M1: the dashboard labels the v1 grade "rule-based" and shows the measured score (v2) panel beside it. Demo accounts
// have no v2 score until M2 rebuilds them from real prints, so the panel says so instead of showing a number.
test('dashboard: v1 is labelled rule-based and the v2 panel states its demo status', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-moderate')
  await expect(page.getByTestId('score-v1-label')).toHaveText(/V1 · RULE-BASED/, { timeout: 30_000 })
  const v2 = page.getByTestId('score-v2')
  await expect(v2).toBeVisible()
  const text = await v2.innerText()
  expect(text).toMatch(/not available for demo accounts yet/i)
  expect(text).not.toMatch(/\b[A-F] · \d+ \/ 100/)          // no letter or score for a demo
  expect(findAdviceTerms(text)).toEqual([])
})

test('methodology page renders the generated method and the scoring version', async ({ page }) => {
  await page.goto('/methodology')
  await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible()
  await expect(page.getByText('fill.effective_half_spread_bps', { exact: false })).toBeVisible()
  await expect(page.getByText(/SCORING v2\.\d+\.\d+/)).toBeVisible()
  expect(findAdviceTerms(await page.locator('main').innerText())).toEqual([])
})
