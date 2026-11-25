import path from 'node:path'
import fs from 'node:fs'
import { test, expect } from '@playwright/test'

// Client-side evidence check (architect decision 2026-11-18): the pack is verified in the browser and never uploaded.
// The fixture is a real pack signed with a throwaway key (frontend/app/lib/__fixtures__, fingerprint 993a80b17c57a4ad).
const PACK = path.join(__dirname, '..', 'app', 'lib', '__fixtures__', 'evidence-pack.json')
const FP = '993a80b17c57a4ad'

test('verify page: a pack is checked in the browser, with no request that carries it', async ({ page }) => {
  // Every request of the page is recorded. The site's layout refreshes the session with POST /api/auth/refresh; that call is not
  // about the pack. What must hold: no request carries any part of the pack, and nothing goes to an evidence route.
  const requests: { url: string; body: string }[] = []
  page.on('request', (r) => requests.push({ url: r.url(), body: r.postData() ?? '' }))
  await page.goto('/verify')
  // design v5 (PROPOSAL §1): the page title says "report", not "evidence pack"; the check itself is unchanged
  await expect(page.getByRole('heading', { name: 'Check a signed report' })).toBeVisible()

  await page.setInputFiles('#pack', PACK)
  const result = page.locator('main section[aria-live="polite"]')   // design v2: the toast region (Sonner) is a second live section, outside main
  await expect(result).toContainText('CONSISTENT', { timeout: 15_000 })
  await expect(result).toContainText('does not show that it came from FillScore')

  await page.fill('#trusted', FP)
  await page.setInputFiles('#pack', PACK)
  await expect(result).toContainText('VALID')
  await expect(result).not.toContainText('CONSISTENT')

  await page.fill('#trusted', 'ba11aa53c4961be4')
  await page.setInputFiles('#pack', PACK)
  await expect(result).toContainText('the pack was not signed by the trusted key')

  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'))
  const secrets = [pack.pack.signature, pack.files['scorecard.json'], 'evidence-pack.json', 'manifest']
  for (const r of requests) {
    expect(r.url).not.toMatch(/evidence/)
    for (const s of secrets) expect(r.url + r.body).not.toContain(s)
  }
})

test('verify page: a changed file is named, a non-pack file is said to be unreadable', async ({ page }) => {
  const doc = JSON.parse(fs.readFileSync(PACK, 'utf8'))
  doc.files['scorecard.json'] = doc.files['scorecard.json'].replace('"A"', '"B"')
  await page.goto('/verify')
  await page.setInputFiles('#pack', { name: 'changed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.locator('main section[aria-live="polite"]')).toContainText('scorecard.json: the file does not match the SHA-256 in the manifest')

  await page.setInputFiles('#pack', { name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(page.locator('main section[aria-live="polite"]')).toContainText('UNREADABLE')
})
