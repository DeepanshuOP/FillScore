import { test, expect, Page } from '@playwright/test'
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../../backend/src/constants/adviceTerms'

const DEMO = 'demo-disciplined'
const PAGES = ['/dashboard', '/trades', '/analytics']

async function bodyText(page: Page, url: string): Promise<string> {
  await page.goto(url)
  await expect(page.getByText('Sample data', { exact: false }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  return page.evaluate(() => document.body.innerText)
}

function assertClean(text: string, where: string) {
  expect(findAdviceTerms(text), `advice terms on ${where}`).toEqual([])
  for (const bad of KNOWN_BAD_STRINGS) expect(text, `known-bad string on ${where}`).not.toContain(bad)
}

test.describe('no advice copy on the sample views', () => {
  for (const p of PAGES) {
    test(`signed out ${p}`, async ({ page }) => {
      assertClean(await bodyText(page, `${p}?userId=${DEMO}`), `signed-out ${p}`)
    })
  }
})
