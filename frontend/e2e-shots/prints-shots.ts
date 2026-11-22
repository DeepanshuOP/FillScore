/**
 * Step 5 of the fourth order: the receipt of a demo order with its tape of public prints, at 1440 and 390, from a local
 * production build.  npm run build && PORT=3101 npm run start   then   npx tsx e2e-shots/prints-shots.ts
 * The API is answered from the fixtures (mock.ts); the replay of the clicked order is the fixture's replay plus the `prints`
 * the backend serves for a demo order (the committed window cut from the checksummed daily file).
 * Prints DOM facts (ticks, fill rings, arrival line, caption) so the picture is checked, not only looked at.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fx, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/prints')
// what the backend's demoPrintsFor returns (it imports the app's env check, so it is read here from the same committed file)
type Cut = { windows: Record<string, { symbol: string; arrivalMs: number; fromMs: number; toMs: number; total: number; truncated: boolean; files: unknown[]; prints: unknown[] }> }
const CUT: Cut = JSON.parse(readFileSync(resolve(__dirname, '../../ml-service/demo_v2/out/demo-moderate/prints.json'), 'utf8'))
const demoPrintsFor = (_demo: string, orderId: string) => {
  const w = CUT.windows[orderId]
  return w ? { symbol: w.symbol, arrivalMs: w.arrivalMs, fromMs: w.fromMs, toMs: w.toMs, total: w.total, truncated: w.truncated, files: w.files, prints: w.prints } : null
}
mkdirSync(OUT, { recursive: true })

async function main() {
  const b = await chromium.launch()
  for (const width of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: process.env.QA_REDUCED ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    await mock(page, false, (p, url) => {
      const m = p.match(/^\/audit\/orders\/([^/]+)\/replay$/)
      if (!m) return undefined
      const id = decodeURIComponent(m[1])
      const base = structuredClone(fx['demo-moderate'].replays[`${url.searchParams.get('symbol')}:${id}`] ?? null) as Record<string, unknown> | null
      if (!base) return undefined
      const prints = demoPrintsFor('demo-moderate', id)
      return prints ? { ...base, prints } : base
    })
    await page.goto(BASE + '/dashboard?userId=demo-moderate&view=orders', { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    await page.locator('[data-testid=orders-row]').nth(2).click()
    await page.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 })
    await page.getByTestId('receipt-prints-tape').waitFor({ timeout: 15000 })
    await page.waitForTimeout(1200)
    const facts = await page.evaluate(() => {
      const t = document.querySelector('[data-testid=receipt-prints-tape]')!
      return {
        ticksBuyer: t.querySelectorAll('path[data-side=buyer]').length,
        ticksSeller: t.querySelectorAll('path[data-side=seller]').length,
        fillRings: t.querySelectorAll('[data-testid=receipt-prints-fill]').length,
        arrival: !!t.querySelector('[data-testid=receipt-prints-arrival]'),
        caption: t.querySelector('figcaption')?.textContent,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    console.log(width, JSON.stringify(facts))
    await page.screenshot({ path: resolve(OUT, `receipt-prints-${width}${process.env.QA_REDUCED ? '-rm' : ''}.jpg`), type: 'jpeg', quality: 60 })
    await ctx.close()
  }
  await b.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
