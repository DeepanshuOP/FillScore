import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// 4a: the analytics page shows a "Post-trade markouts" card for the sample account. The demo trades carry no
// post-trade price enrichment, so the card shows its empty-state sentence (never a made-up number).
// design v5: the Patterns tab (this card's only home) was removed (not-computed policy, PROPOSAL §4 row 3); fixme until the card returns
// from v2 data (the next order). The unit tests of the card's copy stay green.
test.fixme('analytics: Post-trade markouts card renders for demo-moderate, past-tense and advice-free', async ({ page }) => {
  await page.goto('/analytics?userId=demo-moderate')
  const card = page.getByTestId('markout-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card.getByRole('heading', { name: 'Post-trade markouts' })).toBeVisible()
  const text = await card.innerText()
  expect(findAdviceTerms(text)).toEqual([])
  expect(text).toMatch(/markouts|moved/i)
})
