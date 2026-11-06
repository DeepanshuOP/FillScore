import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// 4a: the analytics page shows a "Post-trade markouts" card for the sample account. The demo trades carry no
// post-trade price enrichment, so the card shows its empty-state sentence (never a made-up number).
test('analytics: Post-trade markouts card renders for demo-moderate, past-tense and advice-free', async ({ page }) => {
  await page.goto('/analytics?userId=demo-moderate')
  const card = page.getByTestId('markout-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card.getByRole('heading', { name: 'Post-trade markouts' })).toBeVisible()
  const text = await card.innerText()
  expect(findAdviceTerms(text)).toEqual([])
  expect(text).toMatch(/markouts|moved/i)
})
