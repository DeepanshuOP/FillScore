import { test, expect } from '@playwright/test'
import { storeDemoRunForCurrentData, setExtraTrade } from './db'

// Live-site review item 5: a stored demo Council run is shown only while its packet hashes equal the hashes of the
// packets built from the demo account's current data. When the data changes (here: one more trade), the run no longer
// describes it, and the visitor reads "not yet generated for the current demo data". The real ml-service answers; it
// runs with no LLM (any provider call would raise), so neither state used a model.
const ID = 'demo-moderate'
const MESSAGE = 'Demo analysis not yet generated for the current demo data.'

test.afterAll(async () => { await setExtraTrade(ID, false) })

test('a stored run is served while it matches the data, and not after the data changed', async ({ page }) => {
  await setExtraTrade(ID, false)
  await storeDemoRunForCurrentData(ID)

  await page.goto(`/dashboard?userId=${ID}&view=council`)   // design v2: the Council is its own section
  await page.getByRole('button', { name: 'Run analysis' }).click()
  await expect(page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(MESSAGE)).toHaveCount(0)

  await setExtraTrade(ID, true)                      // the demo data changes: the stored run now describes other data
  await page.goto(`/dashboard?userId=${ID}&view=council`)
  await page.getByRole('button', { name: 'Run analysis' }).click()
  await expect(page.getByText(MESSAGE)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })).toHaveCount(0)
})
