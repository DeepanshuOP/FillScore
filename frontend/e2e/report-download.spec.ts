import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const DEMO = 'demo-disciplined'

test('signed-out demo report downloads as a PDF', async ({ page }) => {
  await page.goto(`/dashboard?userId=${DEMO}`)
  const button = page.getByRole('button', { name: /download report/i })
  await expect(button).toBeVisible()
  const downloadPromise = page.waitForEvent('download') // started before the click
  await button.click()
  const download = await downloadPromise
  const path = await download.path()
  expect(readFileSync(path!).subarray(0, 4).toString('latin1')).toBe('%PDF')
  // the button never stays on "generating"
  await expect(page.getByRole('button', { name: /download report/i })).toBeEnabled()
})
