import { test, expect } from '@playwright/test'
import { signUpFresh } from './session'
import { reshapeDemoAsRebuilt } from './db'

// Design v5, step 3 (PROPOSAL §5 and §3.4): the Reports, Settings, Connect, /demo, /verify and /docs pages on their new layouts.
// Each test asserts a fact that the page must keep or now states; the words come from the proposal's word table.

test('Reports for a demo account is one line, with no NOT ISSUED stamp, and the grade record card follows', async ({ page }) => {
  await page.goto('/app/reports?userId=demo-moderate')
  const card = page.getByTestId('reports-card')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('reports-demo')).toContainText('Demo accounts have no signed report')
  await expect(page.getByText('NOT ISSUED')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Download' })).toHaveCount(0)    // nothing of a demo's to sign or download
  await expect(card).toContainText('Signed with Ed25519, key fingerprint ba11aa53c4961be4')
})

// (The list for a signed-in account with synced orders is asserted in app/components/EvidencePanel.test.tsx: a fresh e2e account has no
// trades, so its Reports page shows "No trades yet" instead.)

test('Settings has the left list of six sections and a destructive action is confirmed in a dialog that can be cancelled', async ({ page }) => {
  await signUpFresh(page)
  await page.goto('/app/settings')
  const nav = page.getByRole('navigation', { name: 'Settings sections' })
  await expect(nav).toBeVisible({ timeout: 30_000 })
  for (const label of ['Account', 'Exchanges', 'API keys', 'Usage', 'Data and privacy', 'About']) await expect(nav.getByRole('link', { name: label })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page')

  await nav.getByRole('link', { name: 'Data and privacy' }).click()
  await expect(page).toHaveURL(/section=data/)
  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible()
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('This cannot be undone')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible()   // still signed in and on the page: nothing was deleted

  await nav.getByRole('link', { name: 'About' }).click()
  await expect(page.getByTestId('settings-versions')).toContainText('Score version')
})

test('Connect shows the exchange cards and the read-only sentence; the key form keeps the read-only banner', async ({ page }) => {
  await signUpFresh(page)
  await page.goto('/app/connect')
  await expect(page.getByRole('heading', { name: 'Connect an exchange' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Read-only keys only. We refuse keys that can trade or withdraw.')).toBeVisible()
  for (const name of ['Binance', 'Bybit', 'OKX']) await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible()
  await page.getByRole('button', { name: /Binance/ }).click()
  await expect(page.getByRole('heading', { name: 'Connect Binance' })).toBeVisible()
  await expect(page.getByText('Only connect read-only API keys.')).toBeVisible()
})

test('/demo shows three cards, each with the synthetic line, a total cost and an Open button to that trader', async ({ page }) => {
  await reshapeDemoAsRebuilt('demo-aggressive')   // gives one trader measured orders in this local database; the others read "not computed"
  await page.goto('/demo')
  const cards = page.getByTestId('demo-choice').getByRole('article')
  await expect(cards).toHaveCount(3)
  for (const card of await cards.all()) {
    await expect(card).toContainText('Synthetic trader, real Binance prices')
    await expect(card.getByRole('link', { name: 'Open' })).toHaveAttribute('href', /\/app\?userId=demo-/)
  }
  const aggressive = page.getByTestId('demo-slip-demo-aggressive').locator('xpath=ancestor::article')
  await expect(aggressive).toContainText('$15.00', { timeout: 30_000 })              // hand value of reshapeDemoAsRebuilt: total $15.00, 4.3 bps
  await expect(aggressive.getByTestId('demo-total-bps')).toHaveText('4.3 bps of the value ordered')
  await expect(aggressive).toContainText(/Orders\s*5(?!\d)/)                          // the 5 stored orders (the total covers the 3 measured ones)
})

test('Home, Costs and Orders explain bps once, with the 0.01%', async ({ page }) => {
  await reshapeDemoAsRebuilt('demo-aggressive')
  for (const [path, ready] of [['/app', 'home-view'], ['/app/costs', 'costs-view'], ['/app/orders', 'orders-view']] as const) {
    await page.goto(`${path}?userId=demo-aggressive`)
    await expect(page.getByTestId(ready)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('bps: basis points. One basis point is 0.01% of an order’s value, so 10 bps is 0.1%.')).toHaveCount(1)
  }
})

test('a demo account\'s first figures are in the HTML the server sends, and the page hydrates without an error', async ({ page, request }) => {
  await reshapeDemoAsRebuilt('demo-aggressive')
  // design v5 step 7: no JavaScript runs for this request, so the figures can only have come from the server
  for (const path of ['/app', '/app/costs']) {
    const html = await (await request.get(`${path}?userId=demo-aggressive`)).text()
    expect(html, path).toContain('$15.00')                  // hand value of reshapeDemoAsRebuilt: total cost
    expect(html, path).toContain('4.3 bps, 3 orders')
    expect(html, path).toContain('Total cost')
  }
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/app/costs?userId=demo-aggressive')
  await expect(page.getByTestId('home-total')).toContainText('$15.00')
  await page.waitForTimeout(1500)
  expect(errors.filter((e) => /hydrat|did not match|server rendered/i.test(e))).toEqual([])
})

test('/docs has a left list with the open document marked, and 16 px body text', async ({ page }) => {
  await page.goto('/docs/mcp')
  const nav = page.getByRole('navigation', { name: 'Docs' })
  await expect(nav.getByRole('link', { name: 'MCP client' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current', 'page')
  const size = await page.locator('main p').first().evaluate((el) => getComputedStyle(el).fontSize)
  expect(size).toBe('16px')
})

test('/verify says "Check a signed report" and has one drop zone', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.getByRole('heading', { name: 'Check a signed report' })).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(1)
  await expect(page.getByText('Drop a signed report here')).toBeVisible()
})
