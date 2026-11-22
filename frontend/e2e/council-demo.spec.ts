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
  await page.goto('/dashboard?userId=demo-moderate&view=council')   // design v2: the Council is its own section
  await page.getByRole('button', { name: 'Run analysis' }).click()
  const heading = page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })
  await expect(heading).toBeVisible({ timeout: 45_000 })
  const panel = page.locator('section#agent-council', { has: heading })

  // 2026-11-22: the scope sits beside the title, from counts the server sends in its `scope` event (the symbol's fills, then
  // the account's); the fee specialist's display name is "Fee Reviewer"
  await expect(page.getByTestId('council-scope')).toHaveText(/^BTCUSDT only: [\d,]+ of the account's [\d,]+ fills\.$/)
  await expect(panel).toContainText('Fee Reviewer')
  await expect(panel).not.toContainText('Fee Optimizer')

  // no A-F letter badge on the assessment (the panel locator must really match, or the zero count proves nothing)
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('span', { hasText: /^[A-F][+-]?$/ })).toHaveCount(0)

  // each of the four specialist notes states its cited values (design v3 fixes A7, ordered: ledger lines traced by the
  // server instead of "N values cited"): the ledger, "No values cited.", or "could not be traced"
  const notes = page.locator('[data-testid=council-notes] article')
  await expect(notes).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    await expect(notes.nth(i)).toContainText(/CITED FROM THE AUDIT|No values cited\.|could not be traced/)
  }

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
    await page.goto(`/dashboard?userId=${id}&view=council`)   // design v2: the Council is its own section
    await page.getByRole('button', { name: 'Run analysis' }).click()
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
    await page.goto(`/dashboard?userId=${id}&view=council`)   // design v2: the Council is its own section
    await page.getByRole('button', { name: 'Run analysis' }).click()
    await expect(page.getByText('Demo analysis not yet generated for the current demo data.')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })).toHaveCount(0)
  })
}
