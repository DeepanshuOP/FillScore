import { test, expect, Page } from '@playwright/test'
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../../backend/src/constants/adviceTerms'
import { signUpFresh } from './session'

const DEMO = 'demo-disciplined'

// What each page really renders once its data has loaded (read from the page sources).
const READY: Record<string, (page: Page) => Promise<void>> = {
  '/dashboard': async (page) => {
    await expect(page.getByText('Sample data', { exact: false }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /download report/i })).toBeVisible()
  },
  '/trades': async (page) => {
    await expect(page.getByRole('heading', { name: 'Trade ledger' })).toBeAttached()
    await expect(page.locator('div[title$="USDT"]').first()).toBeVisible() // first ledger row's symbol cell
  },
  '/analytics': async (page) => {
    await expect(page.getByRole('heading', { name: 'Execution Analytics' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Symbol Breakdown' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  },
}

async function bodyText(page: Page, path: string, query: string): Promise<string> {
  await page.goto(`${path}?${query}`)
  await READY[path](page)
  return page.evaluate(() => document.body.innerText)
}

function assertClean(text: string, where: string) {
  expect(text.length, `page text on ${where}`).toBeGreaterThan(200)
  expect(findAdviceTerms(text), `advice terms on ${where}`).toEqual([])
  for (const bad of KNOWN_BAD_STRINGS) expect(text, `known-bad string on ${where}`).not.toContain(bad)
}

test.describe('no advice copy on the sample views', () => {
  for (const p of Object.keys(READY)) {
    test(`signed out ${p}`, async ({ page }) => {
      assertClean(await bodyText(page, p, `userId=${DEMO}`), `signed-out ${p}`)
    })
  }
  for (const p of Object.keys(READY)) {
    test(`signed in, ?sample=1 ${p}`, async ({ page }) => {
      await signUpFresh(page)
      assertClean(await bodyText(page, p, `userId=${DEMO}&sample=1`), `signed-in sample ${p}`)
    })
  }
})
