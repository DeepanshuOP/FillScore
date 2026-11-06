import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'

// The demo Council is served from the stored fixture (ml-service/demo_runs). The e2e ml-service runs with
// FILLSCORE_E2E_NO_LLM=1, so any attempted provider call raises: this test passing proves no LLM was used.
test('sample dashboard Council: assessment without a letter, values cited, no advice or causal terms', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-disciplined')
  await page.getByRole('button', { name: 'RUN ANALYSIS' }).click()
  const heading = page.getByRole('heading', { name: 'Council assessment' })
  await expect(heading).toBeVisible({ timeout: 45_000 })
  const panel = page.locator('div.border-slate-700', { has: heading })

  // no A-F letter badge on the assessment (the panel locator must really match, or the zero count proves nothing)
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('span', { hasText: /^[A-F][+-]?$/ })).toHaveCount(0)

  // each of the four specialist cards states how many values it cited
  await expect(page.getByText(/^\d+ values cited$/)).toHaveCount(4)

  const text = await page.evaluate(() => document.body.innerText)
  expect(findAdviceTerms(text)).toEqual([])
  expect(text).not.toMatch(/\b(due to|because of|resulting from|caused by|driven by|led to|as a result of)\b/i)
  // mechanism terms
  expect(text).not.toMatch(/\b(mechanism|underlying cause|root cause|explains why|which explains)\b/i)
})
