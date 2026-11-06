import { expect, Page } from '@playwright/test'

/** Signs up a fresh user through the real form; the API logs the user in at once. */
export async function signUpFresh(page: Page): Promise<string> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const password = 'E2e-Password-123!'
  await page.goto('/signup')
  await page.locator('#signup-email').fill(email)
  await page.locator('#signup-password').fill(password)
  await page.locator('#signup-confirm').fill(password)
  await page.getByRole('button', { name: /create|sign up/i }).click()
  await expect(page.getByRole('button', { name: 'LOG OUT' }).first()).toBeVisible()
  return email
}
