import { test, expect } from '@playwright/test'
import { issueVerificationPath, isEmailVerified } from './db'

// Real flow: sign up (the API logs the user in at once) -> follow the verification link the email would carry
// -> own empty state -> log out -> the sample dashboard is still reachable signed out.
test('email sign-up, verification link, own empty state, no demo userId in nav, log out keeps the demo', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const password = 'E2e-Password-123!'
  await page.goto('/signup')
  await page.locator('#signup-email').fill(email)
  await page.locator('#signup-password').fill(password)
  await page.locator('#signup-confirm').fill(password)
  await page.getByRole('button', { name: /create|sign up/i }).click()
  await expect(page.getByRole('button', { name: 'LOG OUT' }).first()).toBeVisible()

  // verification, exactly as clicking the emailed link
  expect(await isEmailVerified(email)).toBe(false)
  await page.goto(await issueVerificationPath(email))
  await expect(page.getByText('Email verified', { exact: true })).toBeVisible()
  expect(await isEmailVerified(email)).toBe(true)

  await page.goto('/dashboard')
  // its own empty state, never the demo data
  await expect(page.getByRole('heading', { name: 'No trades yet' })).toBeVisible()
  await expect(page.getByText('Sample data', { exact: false })).toHaveCount(0)
  expect(page.url()).not.toContain('demo-')

  // (the empty state's own "View sample dashboard" link is an explicit opt-in, so only the nav is checked)
  const navHrefs = await page.locator('header a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
  expect(navHrefs.length).toBeGreaterThan(0)
  for (const h of navHrefs) expect(h, `nav link ${h}`).not.toContain('demo-')

  await page.getByRole('button', { name: 'LOG OUT' }).first().click()
  await expect(page.getByRole('link', { name: 'LOG IN' }).first()).toBeVisible()
  await page.goto('/dashboard?userId=demo-disciplined')
  await expect(page.getByText('Sample data', { exact: false }).first()).toBeVisible()
})
