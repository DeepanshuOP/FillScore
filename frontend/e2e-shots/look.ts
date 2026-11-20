/**
 * One quick look at a screen while building (design v3): a viewport JPEG (quality 60) in .work/look/ and the DOM checks.
 *   npx tsx e2e-shots/look.ts <name> <path> [widths=1440,390] [signed] [carbon] [click=<css>] [wait=<text>] [scroll=<px>] [reduce]
 * Needs a production server on QA_BASE (default http://localhost:3101).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, fx, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const [name, path, widthsArg = '1440,390', ...flags] = process.argv.slice(2)
const flag = (k: string) => flags.find((f) => f === k || f.startsWith(`${k}=`))?.split('=').slice(1).join('=') ?? (flags.includes(k) ? '' : undefined)
const OUT = resolve(__dirname, '../../.work/look')
mkdirSync(OUT, { recursive: true })

async function main() {
  const b = await chromium.launch()
  for (const width of widthsArg.split(',').map(Number)) {
    const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: flag('reduce') !== undefined ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    if (flag('carbon') !== undefined) await page.addInitScript(() => localStorage.setItem('fs-theme', 'carbon'))
    // break-ui fixtures: long values, a single order, or no orders at all (overrides of the demo-moderate answers)
    const breakCase = flag('case')
    const base = fx['demo-moderate'] as unknown as { ordersBody: { orders: Record<string, number>; shortfall: { n: number; totals: Record<string, { usd: number; bps: number; n: number }> } }; trades: { trades: Array<Record<string, unknown>> } }
    const over = (p: string): unknown => {
      if (!breakCase) return undefined
      if (p === '/audit/orders-summary') {
        if (breakCase === 'empty') return { available: false }
        const b = JSON.parse(JSON.stringify(base.ordersBody))
        if (breakCase === 'long') { for (const t of Object.values(b.shortfall.totals) as Array<{ usd: number; n: number }>) { t.usd *= 237_041.3; t.n = 1_234_567 } b.orders = { total: 1_234_567, filled: 1_200_000, partial: 4_567, unfilled: 30_000, open: 0 }; b.shortfall.n = 1_234_567 }
        if (breakCase === 'one') { for (const t of Object.values(b.shortfall.totals) as Array<{ n: number }>) t.n = 1; b.orders = { total: 1, filled: 1, partial: 0, unfilled: 0, open: 0 }; b.shortfall.n = 1 }
        return b
      }
      if (p === '/audit/trades') {
        if (breakCase === 'empty') return { trades: [] }
        if (breakCase === 'one') return { trades: base.trades.trades.slice(0, 1) }
        if (breakCase === 'long') return { trades: base.trades.trades.map((t) => ({ ...t, symbol: '1000SATSFDUSDPERPETUALUSDT', orderId: `${String(t.orderId)}-${'9'.repeat(30)}` })) }
      }
      return undefined
    }
    await mock(page, flag('signed') !== undefined, over)
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    const wait = flag('wait'); if (wait) await page.getByText(wait).first().waitFor({ timeout: 30000 })
    const upload = flag('upload'); if (upload) { await page.locator('input[type=file]').first().setInputFiles(resolve(__dirname, '..', upload)); await page.waitForTimeout(400) }
    const trusted = flag('trusted'); if (trusted) { await page.locator('#trusted').fill(trusted); await page.waitForTimeout(400) }
    const click = flag('click'); if (click) { await page.locator(click).first().click(); await page.waitForTimeout(1200) }
    const scroll = flag('scroll'); if (scroll) { await page.mouse.wheel(0, Number(scroll)); await page.waitForTimeout(1500) }
    await page.waitForTimeout(900)
    await page.screenshot({ path: resolve(OUT, `${name}-${width}.jpg`), type: 'jpeg', quality: 60 })
    console.log(JSON.stringify({ width, ...(await checks(page, name)) }))
    const probe = flag('probe')
    if (probe) console.log(await page.evaluate((sel) => {
      const out: string[] = []
      for (let el = document.querySelector<HTMLElement>(sel); el; el = el.parentElement) out.push(`${el.tagName}.${String(el.className).slice(0, 40)} w=${el.getBoundingClientRect().width} sw=${el.scrollWidth} ov=${getComputedStyle(el).overflowX}`)
      return out.join('\n')
    }, probe))
    if (flag('wide') !== undefined) console.log(await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, out: string[] = [String(document.documentElement.scrollWidth)]
      for (const el of document.querySelectorAll<HTMLElement>('*')) { const r = el.getBoundingClientRect(); if (r.right > vw + 1 && r.width > 0) out.push(`${el.tagName}.${String(el.className).slice(0, 50)} ${Math.round(r.left)}-${Math.round(r.right)} ${getComputedStyle(el).position}`) }
      return out.slice(0, 12).join('\n')
    }))
    await ctx.close()
  }
  await b.close()
}
void main()
