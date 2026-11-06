import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// The demo Council is served from the stored fixture: no live LLM call is made.
test('sample dashboard Council: assessment without a letter, values cited, no advice or causal terms', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-disciplined')
  const panel = page.locator('div', { has: page.getByRole('heading', { name: 'Council assessment' }) }).last()
  await expect(page.getByRole('heading', { name: 'Council assessment' })).toBeVisible({ timeout: 45_000 })

  // no A-F letter badge on the assessment
  await expect(panel.locator('span', { hasText: /^[A-F][+-]?$/ })).toHaveCount(0)

  // every agent card states how many values it cited
  const cited = page.getByText(/^\d+ values cited$/)
  expect(await cited.count()).toBeGreaterThan(0)

  const text = await page.evaluate(() => document.body.innerText)
  expect(findAdviceTerms(text)).toEqual([])
  expect(text).not.toMatch(/\b(due to|because of|resulting from|caused by|driven by|led to|as a result of)\b/i)
})
