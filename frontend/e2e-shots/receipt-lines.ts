/**
 * Step 0b of the fifth order of 2026-11-22: every receipt cost line fits at 320 and 390 px (break-ui).
 *   npm run build && PORT=3101 npm run start   then   npx tsx e2e-shots/receipt-lines.ts
 * The clicked order's replay is the fixture's replay with every cost line present and worst-case figures (six-digit
 * dollars, four-digit bps, a negative line). For each line the label's text (not its dotted leader) must sit inside the
 * label box, and the bps and USD cells inside the receipt. Exit 1 on any clipped line. JPEGs in .work/receipt-lines/.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fx, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/receipt-lines')
mkdirSync(OUT, { recursive: true })

// worst case for width: each line carries a long figure; the labels are the server's (orderReplay.ts TERMS)
const WORST: Record<string, { bps: number; usd: number }> = {
  execution: { bps: 1234.5, usd: 123456.78 },
  spread: { bps: -987.6, usd: -98765.43 },
  impactTiming: { bps: 2222.1, usd: 222222.21 },
  unfilled: { bps: 3333.3, usd: 333333.33 },
  fees: { bps: 1000.0, usd: 100000.0 },
  total: { bps: 6789.0, usd: 678901.23 },
}

async function main() {
  const b = await chromium.launch()
  let failed = 0
  for (const width of [320, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await mock(page, false, (p, url) => {
      const m = p.match(/^\/audit\/orders\/([^/]+)\/replay$/)
      if (!m) return undefined
      const base = structuredClone(fx['demo-moderate'].replays[`${url.searchParams.get('symbol')}:${decodeURIComponent(m[1])}`] ?? null) as
        { decomposition?: Array<{ key: string; bps: number | null; usd: number | null }> } | null
      if (!base?.decomposition) return undefined
      for (const d of base.decomposition) if (WORST[d.key]) Object.assign(d, WORST[d.key])
      return base
    })
    await page.goto(BASE + '/dashboard?userId=demo-moderate&view=orders', { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    await page.locator('[data-testid=orders-row]').nth(2).click()
    await page.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    const lines = await page.evaluate(() => {
      const receipt = document.querySelector('.fs-receipt')!.getBoundingClientRect()
      return [...document.querySelectorAll<HTMLElement>('.fs-lines .lab')].map((lab) => {
        const box = lab.getBoundingClientRect()
        const r = document.createRange()
        r.selectNodeContents(lab.querySelector('.t') ?? lab)
        const rects = [...r.getClientRects()]
        const textRight = Math.max(...rects.map((x) => x.right))
        const cells = [...(lab.parentElement?.querySelectorAll<HTMLElement>('.num') ?? [])].filter((c) => c.parentElement === lab.parentElement && c.getBoundingClientRect().top >= box.top - 30 && c.getBoundingClientRect().top <= box.bottom + 30)
        return {
          label: (lab.querySelector('.t') ?? lab).textContent?.trim(),
          textClipped: textRight > box.right + 0.5,
          lines: new Set(rects.map((x) => Math.round(x.top))).size,
          cellsOutside: cells.some((c) => c.getBoundingClientRect().right > receipt.right + 0.5),
        }
      })
    })
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    // the TOTAL line: every part inside the receipt's content box
    const totalOutside = await page.evaluate(() => {
      const receipt = document.querySelector('.fs-receipt')!
      const right = receipt.getBoundingClientRect().right - parseFloat(getComputedStyle(receipt).paddingRight)
      return [...document.querySelectorAll<HTMLElement>('.fs-receipt .fs-totalline > span')].filter((s) => s.getBoundingClientRect().right > right + 0.5).map((s) => s.textContent)
    })
    const bad = lines.filter((l) => l.textClipped || l.cellsOutside)
    failed += bad.length + (overflowX ? 1 : 0) + totalOutside.length
    console.log(width, JSON.stringify({ count: lines.length, overflowX, totalOutside, lines }))
    await page.getByTestId('explain-replay').getByText('COSTS').scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(OUT, `receipt-lines-${width}.jpg`), type: 'jpeg', quality: 60 })
    await ctx.close()
  }
  await b.close()
  if (failed) { console.error(`FAIL: ${failed} clipped`); process.exit(1) }
  console.log('PASS: every cost line fits')
}
main().catch((e) => { console.error(e); process.exit(1) })
