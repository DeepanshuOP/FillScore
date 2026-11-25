import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// 4a: the analytics page showed a "Post-trade markouts" card for the sample account; the demo trades carry no post-trade price
// enrichment, so the card could only show its empty-state sentence (never a made-up number).
// Design v5 (2026-11-25), PROPOSAL §4 rows 3 and 4, class (a): the Patterns tab, this card's only home, is gone for accounts that
// never have the data. The fact under test is now: the card is absent from the app (the old address opens Fills), and the research
// views are stated once, in past-tense, advice-free words, in Methodology. The unit tests of the card's copy stay green.
test('analytics: the Post-trade markouts card is absent for demo-moderate and Methodology states the research views, past-tense and advice-free', async ({ page }) => {
  await page.goto('/analytics?userId=demo-moderate')
  await expect(page).toHaveURL(/\/app\/fills\?userId=demo-moderate/, { timeout: 30_000 })
  await expect(page.getByText('TAKER').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('markout-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Post-trade markouts' })).toHaveCount(0)

  // the class (a) line: one sentence in Methodology says what the audit does not include and why nothing is shown
  await page.goto('/methodology')
  const line = page.getByTestId('research-views')
  await expect(line).toBeVisible()
  const text = await line.innerText()
  expect(text).toMatch(/Post-trade markouts and the correlation of fills with large trades are research views\./)
  expect(text).toMatch(/not part of the audit/)
  expect(findAdviceTerms(text)).toEqual([])
})
