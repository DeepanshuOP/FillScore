import { test, expect } from '@playwright/test'
import { findAdviceTerms } from '../../backend/src/constants/adviceTerms'
import { storeDemoRunForCurrentData } from './db'

// A demo run is served only if its packet hashes equal those of the current data (live-site review item 5), so the
// committed fixture is first stored as a run for this database's current demo-moderate data.
// 2026-11-20: all three committed runs were re-recorded under claim rules 1.3.0 (PROGRESS, item 26) and are served.
test.beforeAll(async () => {
  await storeDemoRunForCurrentData('demo-moderate')
})

// The demo Council is served from the stored fixture (ml-service/demo_runs). The e2e ml-service runs with
// FILLSCORE_E2E_NO_LLM=1, so any attempted provider call raises: this test passing proves no LLM was used.
test('sample dashboard Council: assessment without a letter, values cited, no advice or causal terms', async ({ page }) => {
  await page.goto('/dashboard?userId=demo-moderate')
  await page.getByRole('button', { name: 'RUN ANALYSIS' }).click()
  const heading = page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })
  await expect(heading).toBeVisible({ timeout: 45_000 })
  const panel = page.locator('section#agent-council', { has: heading })

  // no A-F letter badge on the assessment (the panel locator must really match, or the zero count proves nothing)
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('span', { hasText: /^[A-F][+-]?$/ })).toHaveCount(0)

  // each of the four specialist cards states how many values it cited
  await expect(page.getByText(/^\d+ values cited$/)).toHaveCount(4)

  const text = await page.evaluate(() => document.body.innerText)
  // The exemption for "Unfilled Opportunity Cost Assessed" (item 27) is gone: the run was re-recorded and the claim
  // check now reads the specialists' flags, so no advice or counterfactual term is left on the page.
  expect(text).not.toContain('Opportunity Cost')
  expect(findAdviceTerms(text)).toEqual([])
  expect(text).not.toMatch(/\b(due to|because of|resulting from|caused by|driven by|led to|as a result of)\b/i)
  // mechanism terms
  expect(text).not.toMatch(/\b(mechanism|underlying cause|root cause|explains why|which explains)\b/i)
})

// The other two committed runs are served too (2026-11-20).
for (const id of ['demo-disciplined', 'demo-aggressive']) {
  test(`${id}: the re-recorded run is shown`, async ({ page }) => {
    await storeDemoRunForCurrentData(id)
    await page.goto(`/dashboard?userId=${id}`)
    await page.getByRole('button', { name: 'RUN ANALYSIS' }).click()
    const heading = page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })
    await expect(heading).toBeVisible({ timeout: 45_000 })
    // the Council panel only: the page around it still carries older copy that the dashboard rebuild replaces
    const panel = page.locator('section#agent-council', { has: heading })
    expect(findAdviceTerms(await panel.innerText())).toEqual([])
  })
}

// Claim rules 1.2.0 and 1.3.0: a stored demo run with a causal phrasing, a number-free judgement or a flag holding a
// counterfactual word is not served; nothing is shown in its place. The stored copy is changed here on purpose.
const REFUSED: [string, string, (r: Record<string, unknown>) => Record<string, unknown>][] = [
  ['a causal phrasing', 'demo-aggressive', (r) => ({ ...r, fee: { ...(r.fee as object), recommendedAction: 'Fees were 4.0 bps, resulting in a drag.' } })],
  ['a flag with a counterfactual word', 'demo-disciplined', (r) => ({ ...r, alpha: { ...(r.alpha as object), flags: ['unfilled_opportunity_cost_assessed'] } })],
]
for (const [why, id, mutate] of REFUSED) {
  test(`${id}: a run with ${why} is not shown`, async ({ page }) => {
    await storeDemoRunForCurrentData(id, process.env.MONGODB_URI, mutate)
    await page.goto(`/dashboard?userId=${id}`)
    await page.getByRole('button', { name: 'RUN ANALYSIS' }).click()
    await expect(page.getByText('Demo analysis not yet generated for the current demo data.')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })).toHaveCount(0)
  })
}
