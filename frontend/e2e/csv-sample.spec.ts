import { test, expect } from '@playwright/test'

// A5 (orders of 2026-11-23): "Try the sample file" on the broker-file check, open to a visitor with no account and to a demo account.
// The hop from the ml-service to Binance's public prints is covered by ml-service/tests/csv_import/test_sample.py (a hand tape) and a
// live run noted in docs/research/LOG.md; here the answer of POST /api/check/sample is a fixed result (the same fixture as
// csv-check.spec.ts plus the sample marker), so the page's own work is what is tested: no login, no file sent, the label, the limits.
const fill = {
  txid: 'SAMPLE-T01', order_id: 'SAMPLE-O01', symbol: 'BTCUSDT', side: 1, ts_ms: 1788332833047, price: 77609.12, qty: 0.0021, cost: 162.979152, fee_bps: 10, fee_usd: 0.162979,
  taker: true, mid: 77609.12, quote_quality: 'both_sides', eff_half_bps: 0, total_bps: 10, cost_usd: 0, unmeasured_reason: null, market_data: [],
}
const result = {
  format: 'kraken', provenance: 'Read with the column layout of Kraken\'s documented Trades export. That reading is built from Kraken\'s documentation and is not yet checked against a real file.',
  fee_known: true, stored: false, skipped: [], assumptions: ['The reference market is Binance\'s USDT market. That is an assumption.'],
  summary: { fills: 1, measured: 1, unmeasured: 0, unmeasured_reasons: {}, median_eff_half_bps: 0, weighted_eff_half_bps: 0, total_eff_cost_usd: 0, total_fee_usd: 0.162979, weighted_fee_bps: 10 },
  fills: [fill], limits: { max_fills: 200, max_chars: 200000, market_data_deadline_s: 60 },
  sample: { label: 'Sample file: synthetic fills, real prices', sha256: 'a4cf849c5667e536bb45657ae0a5956f970729b1d1f345c0e437d10e15c24448' },
}

for (const [name, url] of [['signed out', '/app/check'], ['in demo mode', '/app/check?userId=demo-moderate']] as const) {
  test(`sample file, ${name}: one click prints the labelled result, nothing is sent and no login is needed`, async ({ page }) => {
    let seen: { auth: string | undefined; body: string | null; method: string } | null = null
    await page.route('**/api/check/sample', async (route) => {
      const r = route.request()
      seen = { auth: r.headers()['authorization'], body: r.postData(), method: r.method() }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
    })
    await page.goto(url)
    await page.getByTestId('try-sample').click()
    await expect(page.getByTestId('sample-label')).toHaveText(/Sample file: synthetic fills, real prices/i)
    const out = page.getByTestId('csv-result')
    await expect(out).toContainText('1 of 1 fill was compared with the public price at their second.')
    await expect(out).toContainText('Fees stated in the file: $0.16')
    expect(seen!.method).toBe('POST')
    expect(seen!.auth).toBeUndefined()
    expect(seen!.body).toBeNull()
    expect(await out.innerText()).not.toMatch(/should|could save|because|caused/i)
  })
}

test('sample file against the real backend: unconfigured here so it says so; the 4th call in the hour is refused by the limit', async ({ page, request }) => {
  // The e2e backend has no ml-service address, so the route answers 503 sample_unavailable. Every request counts toward the 3 an hour per IP.
  await page.goto('/app/check')
  await page.getByTestId('try-sample').click()                                               // call 1
  await expect(page.getByTestId('csv-error')).toContainText('The sample file cannot be checked right now.')
  for (let i = 2; i <= 3; i++) expect((await request.post('http://localhost:3001/api/check/sample')).status(), `call ${i}`).toBe(503)
  await page.getByTestId('try-sample').click()                                               // call 4
  await expect(page.getByTestId('csv-error')).toContainText('The sample file can be checked 3 times an hour. Try again later.')
  expect((await request.post('http://localhost:3001/api/check/sample')).status()).toBe(429)
})
