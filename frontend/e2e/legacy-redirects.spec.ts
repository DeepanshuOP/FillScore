import { test, expect } from '@playwright/test'

/**
 * IA v4 (step 1): every address that existed before the move answers a permanent 308 to its new page, keeps the rest of the
 * query, and a browser that follows it lands on the new page. The table is legacyRedirects.mjs (unit test: app/utils/legacyRedirects.test.ts).
 */
const ORDER = 'ord-moderate-BTCUSDT-319184'
const CASES: Array<{ old: string; path: string; keeps: string[] }> = [
  { old: '/dashboard?userId=demo-moderate', path: '/app', keeps: ['userId=demo-moderate'] },
  { old: '/dashboard?view=overview&userId=demo-moderate', path: '/app/overview', keeps: ['userId=demo-moderate'] },
  { old: `/dashboard?view=orders&userId=demo-moderate&order=${ORDER}`, path: '/app/orders', keeps: ['userId=demo-moderate', `order=${ORDER}`] },
  { old: '/dashboard?view=rules&userId=demo-moderate', path: '/app/rules', keeps: ['userId=demo-moderate'] },
  { old: '/dashboard?view=rankings&userId=demo-moderate', path: '/app/rankings', keeps: ['userId=demo-moderate'] },
  { old: '/dashboard?view=council&userId=demo-moderate', path: '/app/council', keeps: ['userId=demo-moderate'] },
  { old: '/dashboard?view=evidence&userId=demo-moderate', path: '/app/evidence', keeps: ['userId=demo-moderate'] },
  { old: '/trades?userId=demo-moderate&symbol=BTCUSDT', path: '/app/fills', keeps: ['userId=demo-moderate', 'symbol=BTCUSDT'] },
  { old: '/analytics?userId=demo-moderate', path: '/app/fills', keeps: ['userId=demo-moderate', 'tab=patterns'] },
  { old: '/check', path: '/app/check', keeps: [] },
]

for (const c of CASES) {
  test(`${c.old} answers 308 to ${c.path} and lands there`, async ({ request, page }) => {
    const r = await request.get(c.old, { maxRedirects: 0 })
    expect(r.status()).toBe(308)
    const location = new URL(r.headers()['location'], 'http://x')
    expect(location.pathname).toBe(c.path)
    for (const k of c.keeps) expect(location.search).toContain(k)

    await page.goto(c.old)
    await expect.poll(() => new URL(page.url()).pathname).toBe(c.path)
    for (const k of c.keeps) expect(new URL(page.url()).search).toContain(k)
    await expect(page.locator('main')).toBeVisible()
  })
}

test('/settings and /onboarding answer 308 to the new addresses (signed out they then go to log in)', async ({ request }) => {
  for (const [old, path] of [['/settings', '/app/settings'], ['/onboarding', '/app/connect']]) {
    const r = await request.get(old, { maxRedirects: 0 })
    expect(r.status()).toBe(308)
    expect(new URL(r.headers()['location'], 'http://x').pathname).toBe(path)
  }
})
