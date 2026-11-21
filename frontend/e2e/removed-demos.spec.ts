import { test, expect } from '@playwright/test'

// Decision 8 (2026-11-13): demo-bybit, demo-okx and demo-multi were removed from the product.
const REMOVED = ['demo-bybit', 'demo-okx', 'demo-multi']

test('/share/demo-bybit shows the "no longer available" state', async ({ page }) => {
  await page.goto('/share/demo-bybit')
  await expect(page.getByText('This score card is no longer available.')).toBeVisible()
})

test('demo picker lists only the three remaining demos', async ({ page }) => {
  await page.goto('/')
  // the picker sits in a card that fades in on scroll, so assert on attached DOM text, not visibility
  await expect(page.getByRole('heading', { name: 'Open a finished audit.' })).toHaveCount(1)   // design v3.1: the picker's heading (its lede was cut)
  const text = await page.evaluate(() => document.body.textContent ?? '')
  for (const id of REMOVED) expect(text).not.toContain(id)
  await expect(page.getByText('The Bybit Trader')).toHaveCount(0)
  await expect(page.getByText('The OKX Trader')).toHaveCount(0)
  await expect(page.getByText('The Multi-Exchange Trader')).toHaveCount(0)
  // A3: the demo is named by what it does (selector text only)
  await expect(page.getByText('Limit orders, daytime')).toHaveCount(1)
})
