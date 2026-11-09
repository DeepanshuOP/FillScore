import { test, expect } from '@playwright/test'

const HIDDEN = ['demo-bybit', 'demo-okx', 'demo-multi']

test('/share/demo-bybit shows the clean unavailable state', async ({ page }) => {
  await page.goto('/share/demo-bybit')
  await expect(page.getByText('This demo is temporarily unavailable')).toBeVisible()
})

test('demo picker lists no hidden demo id', async ({ page }) => {
  await page.goto('/')
  // the picker sits in a card that fades in on scroll, so assert on attached DOM text, not visibility
  await expect(page.getByText('Or explore with synthetic demo data')).toHaveCount(1)
  const text = await page.evaluate(() => document.body.textContent ?? '')
  for (const id of HIDDEN) expect(text).not.toContain(id)
  await expect(page.getByText('The Bybit Trader')).toHaveCount(0)
  await expect(page.getByText('The OKX Trader')).toHaveCount(0)
  await expect(page.getByText('The Multi-Exchange Trader')).toHaveCount(0)
  await expect(page.getByText('The Disciplined Trader')).toHaveCount(1)
})
