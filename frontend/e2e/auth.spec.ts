import { test, expect } from '@playwright/test'

test('email sign-up lands on its own empty state, nav carries no demo userId, log out keeps the demo', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`
  const password = 'E2e-Password-123!'
  await page.goto('/signup')
  await page.locator('#signup-email').fill(email)
  await page.locator('#signup-password').fill(password)
  await page.locator('#signup-confirm').fill(password)
  await page.getByRole('button', { name: /create|sign up/i }).click()

  await page.goto('/dashboard')
  // its own empty state, never the demo data
  await expect(page.getByText('Sample data', { exact: false })).toHaveCount(0)
  expect(page.url()).not.toContain('demo-')

  const hrefs = await page.locator('header a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''))
  for (const h of hrefs) expect(h, `nav link ${h}`).not.toContain('demo-')

  await page.getByText('LOG OUT').first().click()
  await page.goto('/dashboard?userId=demo-disciplined')
  await expect(page.getByText('Sample data', { exact: false }).first()).toBeVisible()
})
