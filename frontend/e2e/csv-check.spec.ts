import { test, expect } from '@playwright/test'
import { signUpFresh } from './session'

// M6 §1: the broker-file check. A signed-in user without an exchange connection opens /check, chooses a file and reads each fill compared
// with the public price at its second. The comparison itself needs Binance's public API, so this test answers that one call with a fixed
// result (hand-computed in ml-service/tests/csv_import/test_service.py); the refusal test below goes through the real ml-service.
const KRAKEN_HEADER = 'txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers\n'
const KRAKEN = KRAKEN_HEADER
  + 'T1,OT1,XBT/USD,2024-01-15 14:00:01.1230,buy,market,100.02,100.02,0.160032,1.0,0,initiated,\n'

const fill = {
  txid: 'T1', order_id: 'OT1', symbol: 'BTCUSDT', side: 1, ts_ms: 1705327201123, price: 100.02, qty: 1, cost: 100.02, fee_bps: 16, fee_usd: 0.160032,
  taker: true, mid: 100, quote_quality: 'both_sides', eff_half_bps: 2, total_bps: 18, cost_usd: 0.020004, unmeasured_reason: null, market_data: [],
}
const result = {
  format: 'kraken', provenance: 'Read with the column layout of Kraken\'s documented Trades export. That reading is built from Kraken\'s documentation and is not yet checked against a real file.',
  fee_known: true, stored: false, skipped: [], assumptions: ['The reference market is Binance\'s USDT market. That is an assumption.'],
  summary: { fills: 1, measured: 1, unmeasured: 0, unmeasured_reasons: {}, median_eff_half_bps: 2, weighted_eff_half_bps: 2, total_eff_cost_usd: 0.020004, total_fee_usd: 0.160032, weighted_fee_bps: 16 },
  fills: [fill], limits: { max_fills: 200, max_chars: 200000, market_data_deadline_s: 60 },
}

test('check page: a Kraken file is sent once with the login token and the findings are shown in past tense', async ({ page }) => {
  await signUpFresh(page)
  let seen: { auth: string | undefined; body: unknown } | null = null
  await page.route('**/ml/csv/check', async (route) => {
    seen = { auth: route.request().headers()['authorization'], body: route.request().postDataJSON() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await page.goto('/check')
  await page.setInputFiles('input[type=file]', { name: 'trades.csv', mimeType: 'text/csv', buffer: Buffer.from(KRAKEN) })
  await page.getByRole('button', { name: 'CHECK THE FILE' }).click()
  const out = page.getByTestId('csv-result')
  await expect(out).toContainText('1 of 1 fill was compared with the public price at their second.')
  await expect(out).toContainText('Median cost against the mid-price just before each fill: 2.0 bps')
  await expect(out).toContainText('Fees stated in the file: $0.16')
  await expect(out).toContainText('not yet checked against a real file')
  expect(seen!.auth).toMatch(/^Bearer /)
  expect(seen!.body).toEqual({ format: 'kraken', csv: KRAKEN })
  const text = await out.innerText()
  expect(text).not.toMatch(/should|could save|because|caused/i)
})

test('check page: a file that is not a Kraken export is refused by the service with its reason, nothing is stored', async ({ page }) => {
  await signUpFresh(page)
  await page.goto('/check')
  await page.setInputFiles('input[type=file]', { name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') })
  await page.getByRole('button', { name: 'CHECK THE FILE' }).click()
  await expect(page.getByTestId('csv-error')).toContainText('this is not a Kraken Trades export: missing columns')
})
