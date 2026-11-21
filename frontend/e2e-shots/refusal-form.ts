/**
 * Design v3 fixes A8 check: after a refused key (the mock answers key_not_read_only with the permissions named), the
 * refusal reads in plain words and the form matches the last correction: Binance keeps the key and secret filled (the
 * corrections edit the same key); Bybit and OKX clear both and focus the key field (they ask for a new key).
 *   npx tsx e2e-shots/refusal-form.ts   (production server on QA_BASE, default :3101). Exit 1 on a failed check.
 */
import { chromium } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const EXPECT: Record<string, { keep: boolean; last: string }> = {
  Binance: { keep: true, last: 'Press Connect again. Nothing from this attempt was stored.' },
  Bybit: { keep: false, last: 'Paste the new key and its secret here. Nothing from this attempt was stored.' },
  OKX: { keep: false, last: 'Paste the new key and its secret here. Nothing from this attempt was stored.' },
}

;(async () => {
  const b = await chromium.launch()
  let bad = 0
  for (const [exchange, want] of Object.entries(EXPECT)) {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
    await mock(page, true)
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(exchange) }).first().click()
    await page.getByLabel('API key', { exact: true }).fill('qa-demo-key')
    await page.getByLabel('API secret', { exact: true }).fill('qa-demo-secret')
    if (exchange === 'OKX') await page.getByLabel('API passphrase', { exact: true }).fill('qa-pass')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Connect account' }).click()
    await page.getByText('The key was refused').waitFor({ timeout: 15000 })
    await page.waitForTimeout(300)
    const key = await page.getByLabel('API key', { exact: true }).inputValue()
    const secret = await page.getByLabel('API secret', { exact: true }).inputValue()
    const focused = await page.evaluate(() => document.activeElement?.id ?? '')
    const text = await page.locator('[data-kind=refused]').innerText()
    const checks = {
      plainWords: text.includes('Turned on: Spot & Margin Trading, Withdrawals. Needed: Reading only.') && !/Disable:|Enable:/.test(text.split('CORRECTIONS')[0]),
      lastCorrection: text.includes(want.last),
      fields: want.keep ? key === 'qa-demo-key' && secret === 'qa-demo-secret' : key === '' && secret === '',
      focus: want.keep ? true : focused === 'onb-api-key',
    }
    const ok = Object.values(checks).every(Boolean)
    if (!ok) bad++
    console.log(JSON.stringify({ exchange, ok, ...checks, key, secret: secret ? '(filled)' : '', focused }))
    await page.close()
  }
  await b.close()
  process.exit(bad ? 1 : 0)
})()
