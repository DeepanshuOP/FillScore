import { test, expect } from '@playwright/test'

/**
 * IA v4 (sixth order, step 9): what the app does for a visitor, against the real stack.
 *  - a demo Home plays RECORDED answers of the Ask agent, labelled, with no input box;
 *  - a degraded recorded answer says so in one line and never credits a model;
 *  - a signed-out visitor to /app/* without a demo account is sent to log in;
 *  - /app/check opens signed out and in demo mode;
 *  - the page header carries the provenance on every app page and the sidebar does not.
 */
test('a demo Home plays a recorded answer: labelled, scoped, with the language-model heading, and no input box', async ({ page }) => {
  await page.goto('/app?userId=demo-moderate')
  await expect(page.getByRole('heading', { name: 'Ask FillScore' })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByTestId('ask-chip').first().click()
  const slip = page.getByTestId('ask-slip')
  await expect(slip).toContainText('RECORDED ANSWER, NOT LIVE')
  await expect(slip).toContainText(/\d[\d,]* orders?/i)   // the scope line, placed by code (the e2e database has its own seeded counts)
  await expect(slip).toContainText('Explanation (language model; every number was checked against the audit)')
  await expect(slip).toContainText(/Answered by groq\//)
})

test('a degraded recorded answer is the last chip, says so in one line and credits no model', async ({ page }) => {
  await page.goto('/app?userId=demo-moderate')
  await page.getByTestId('ask-chip').last().click()
  const slip = page.getByTestId('ask-slip')
  await expect(slip).toContainText("The model's answer did not pass the checks, so code wrote this sentence from the measured values.")
  await expect(slip).toContainText('Model calls: 2 · answer not used')
  await expect(slip).not.toContainText('Explanation (language model')
  await expect(slip).not.toContainText(/groq|qwen/i)
})

test('a signed-out visitor to /app without a demo account goes to log in', async ({ page }) => {
  await page.goto('/app')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
  await page.goto('/app/orders')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
  await page.goto('/app/settings')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
})

test('/app/check opens signed out and in demo mode, and says the check needs a signed-in account', async ({ page }) => {
  await page.goto('/app/check')
  await expect(page).toHaveURL(/\/app\/check$/)
  await expect(page.getByText('Checking a file needs a signed-in account')).toBeVisible()
  await expect(page.getByTestId('csv-check-panel')).toBeVisible()
  await page.goto('/app/check?userId=demo-moderate')
  await expect(page).toHaveURL(/\/app\/check\?userId=demo-moderate/)
  await expect(page.getByTestId('csv-check-panel')).toBeVisible()
})

test('⌘K opens without error, lists the nine sections with their glosses, goes there and Escape closes it', async ({ page }) => {
  // A real defect found in the keyboard pass: the palette threw on open ("reading 'subscribe'") because its list had no cmdk root.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/app?userId=demo-moderate')
  await expect(page.getByRole('heading', { name: 'Ask FillScore' })).toBeVisible()
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Jump to' })
  await expect(palette).toBeVisible()
  for (const label of ['Home', 'Overview', 'Orders', 'Rules', 'Rankings', 'Council', 'Evidence', 'Fills', 'Check a broker file']) await expect(palette).toContainText(label)
  await expect(palette).toContainText('A language-model review of the audit')
  await page.keyboard.type('Rankings')
  await page.keyboard.press('Enter')
  await expect.poll(() => new URL(page.url()).pathname).toBe('/app/rankings')
  expect(new URL(page.url()).searchParams.get('userId')).toBe('demo-moderate')
  await page.keyboard.press('Control+k')
  await expect(palette).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  expect(errors).toEqual([])
})

test('the provenance prints once, in the page header, and not in the sidebar', async ({ page }) => {
  await page.goto('/app/overview?userId=demo-moderate')
  const header = page.getByTestId('app-page-header')
  await expect(header).toContainText('Synthetic trader, real prices')
  await expect(header.getByTestId('header-period')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'App' })).not.toContainText('Synthetic trader, real prices')
})
