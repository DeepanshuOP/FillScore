import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { signUpFresh } from './session'

const DEMO = 'demo-disciplined'
const BUTTON = /download report/i

async function expectPdfDownload(page: Page) {
  const button = page.getByRole('button', { name: BUTTON })
  await expect(button).toBeVisible()
  const downloadPromise = page.waitForEvent('download') // started before the click
  await button.click()
  const download = await downloadPromise
  const path = await download.path()
  expect(readFileSync(path!).subarray(0, 4).toString('latin1')).toBe('%PDF')
  await expect(page.getByRole('button', { name: BUTTON })).toBeEnabled() // never stuck on "generating"
}

test('signed-out demo report downloads as a PDF', async ({ page }) => {
  await page.goto(`/dashboard?userId=${DEMO}`)
  await expectPdfDownload(page)
})

test('signed-in ?sample=1 report downloads as a PDF', async ({ page }) => {
  await signUpFresh(page)
  await page.goto(`/dashboard?userId=${DEMO}&sample=1`)
  await expectPdfDownload(page)
})

// A signed-in user with no audit never sees the button on their own dashboard (they get the "No trades yet"
// empty state), so the only reachable place for this failure is the sample view, where the button is shown.
// Only the report response is stubbed, with the exact status and body the backend sends when no audit exists
// (backend/src/routes/audit.ts GET /audit/report).
test('a 404 from the report endpoint shows an inline error and never sticks on "generating"', async ({ page }) => {
  await signUpFresh(page)
  await page.route('**/audit/report**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'No audit found for this user.' }) }))
  await page.goto(`/dashboard?userId=${DEMO}&sample=1`)
  const button = page.getByRole('button', { name: BUTTON })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.getByRole('alert').filter({ hasText: '(HTTP 404)' })).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'No audit found for this user.' })).toBeVisible()
  await expect(page.getByRole('button', { name: BUTTON })).toBeEnabled()
  await expect(page.getByText('GENERATING...')).toHaveCount(0)
})
