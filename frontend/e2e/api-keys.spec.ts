import { test, expect } from '@playwright/test'
import { signUpFresh } from './session'
import { API } from './env'

// Personal API keys (item 15), through the real Settings page: create a read-only key, see it once, use it on a read route, see it
// refused on another route, revoke it, see it stop working.
test('settings: a read-only API key is shown once, reads the account, cannot do more, and stops when revoked', async ({ page }) => {
  await signUpFresh(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'API KEYS FOR AI CLIENTS (READ-ONLY)' })).toBeVisible()

  await page.locator('#key-name').fill('e2e client')
  await page.locator('#key-password').fill('E2e-Password-123!')
  await page.getByRole('button', { name: 'Create a read-only key' }).click()
  const shown = page.getByTestId('new-api-key')
  await expect(shown).toBeVisible()
  const text = await shown.innerText()
  const key = /FILLSCORE_API_KEY=(fsk_[0-9a-f]{8}_[A-Za-z0-9_-]{43})/.exec(text)?.[1]
  expect(key).toBeTruthy()
  expect(text).toContain('FILLSCORE_API_URL=')

  const bearer = { Authorization: `Bearer ${key}` }
  expect((await page.request.get(`${API}/api/audit/orders-summary`, { headers: bearer })).status()).toBe(200)
  const blocked = await page.request.get(`${API}/api/audit/trades`, { headers: bearer })
  expect(blocked.status()).toBe(403)
  expect((await blocked.json()).error).toBe('api_key_scope')
  expect((await page.request.get(`${API}/api/keys`, { headers: bearer })).status()).toBe(401)

  // shown once: after a reload only the name and the prefix remain
  await page.reload()
  await expect(page.getByTestId('new-api-key')).toHaveCount(0)
  await expect(page.getByText('e2e client')).toBeVisible()
  await expect(page.getByText(`${key!.slice(0, 12)}…`)).toBeVisible()
  expect(await page.content()).not.toContain(key!.slice(13))

  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('Key revoked. It stopped working at once.')).toBeVisible()
  expect((await page.request.get(`${API}/api/audit/orders-summary`, { headers: bearer })).status()).toBe(401)
})
