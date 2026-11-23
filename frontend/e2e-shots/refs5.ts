/**
 * Design v5 research (step 2): captures public reference pages at 1440x900 and on a phone (Pixel 8, Chromium, touch), and measures
 * them with the same in-page function as the audit (audit5.ts `measure`): smallest font, text under 12 px, uppercase letter-spaced
 * runs, small tap targets on the phone, plus the body font size and the most common text size.
 * No login, no form is filled, nothing is clicked except a cookie banner's reject or close button when one is found.
 *   npx tsx e2e-shots/refs5.ts <out-dir> [name,name]
 */
import { chromium, devices, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { measure } from './audit5'

const OUT = resolve(process.argv[2] ?? resolve(__dirname, '../../docs/design/v5/refs'))
mkdirSync(OUT, { recursive: true })

export const REFS: Array<{ name: string; url: string; group: string }> = [
  { group: 'cal.com', name: 'cal-home', url: 'https://cal.com/' },
  { group: 'cal.com', name: 'cal-pricing', url: 'https://cal.com/pricing' },
  { group: 'cal.com', name: 'cal-docs', url: 'https://cal.com/docs' },
  { group: 'app shells', name: 'linear-home', url: 'https://linear.app/' },
  { group: 'app shells', name: 'vercel-home', url: 'https://vercel.com/' },
  { group: 'app shells', name: 'stripe-dashboard-docs', url: 'https://docs.stripe.com/dashboard/basics' },
  { group: 'app shells', name: 'mercury-home', url: 'https://mercury.com/' },
  { group: 'app shells', name: 'ramp-home', url: 'https://ramp.com/' },
  { group: 'app shells', name: 'dub-home', url: 'https://dub.co/' },
  { group: 'app shells', name: 'resend-home', url: 'https://resend.com/' },
  { group: 'readable data', name: 'plausible-live', url: 'https://plausible.io/plausible.io' },
  { group: 'readable data', name: 'posthog-home', url: 'https://posthog.com/' },
  { group: 'readable data', name: 'tradingview-chart', url: 'https://www.tradingview.com/chart/' },
  { group: 'readable data', name: 'koinly-home', url: 'https://koinly.io/' },
  { group: 'readable data', name: 'cointracker-home', url: 'https://www.cointracker.io/' },
  { group: 'crypto TCA', name: 'talos-tca', url: 'https://www.talos.com/' },
  { group: 'crypto TCA', name: 'kaiko-home', url: 'https://www.kaiko.com/' },
  { group: 'crypto TCA', name: 'amberdata-home', url: 'https://www.amberdata.io/' },
  { group: 'crypto TCA', name: 'bestex-home', url: 'https://www.bestexresearch.com/' },
  { group: 'awwwards', name: 'awwwards-saas', url: 'https://www.awwwards.com/websites/saas/' },
  { group: 'awwwards', name: 'awwwards-fintech', url: 'https://www.awwwards.com/websites/finance/' },
]

async function dismiss(p: Page) {
  for (const name of [/reject all/i, /decline/i, /only necessary|necessary only|essential only/i, /^close$/i, /accept all/i]) {
    const b = p.getByRole('button', { name }).first()
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 2000 }).catch(() => undefined); await p.waitForTimeout(400); return }
  }
}

async function typeStats(p: Page) {
  return p.evaluate(() => {
    const sizes = new Map<number, number>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; const t = (n.textContent ?? '').trim()
      if (!el || !t) continue
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.top > innerHeight * 3) continue
      const px = Math.round(parseFloat(getComputedStyle(el).fontSize))
      sizes.set(px, (sizes.get(px) ?? 0) + t.length)
    }
    const top = [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s}px:${c}`)
    return { bodyPx: parseFloat(getComputedStyle(document.body).fontSize), commonSizes: top }
  })
}

async function main() {
  const only = process.argv[3]?.split(',')
  const b = await chromium.launch()
  const rows: unknown[] = []
  for (const ref of REFS.filter((r) => !only || only.includes(r.name))) {
    for (const [vp, ctxOpts, phone] of [['1440', { viewport: { width: 1440, height: 900 } }, false], ['phone', (() => { const { defaultBrowserType: _d, ...d } = devices['Pixel 8']; return d })(), true]] as const) {
      const ctx = await b.newContext({ ...ctxOpts, deviceScaleFactor: 1, locale: 'en-US' })
      const page = await ctx.newPage()
      const row: Record<string, unknown> = { name: ref.name, group: ref.group, url: ref.url, viewport: vp }
      try {
        await page.goto(ref.url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        await page.waitForTimeout(3500); await dismiss(page); await page.waitForTimeout(800)
        await page.screenshot({ path: resolve(OUT, `${ref.name}-${vp}.jpg`), type: 'jpeg', quality: 50 })
        const m = await measure(page, phone)
        Object.assign(row, { minFontPx: m.minFontPx, under12: m.under12, textNodes: m.textNodes, capsRuns: m.capsRuns, capsUnder12: m.capsUnder12, smallTargets: phone ? m.smallTargets : undefined }, await typeStats(page))
      } catch (e) { row.error = String(e).slice(0, 160) }
      rows.push(row); await ctx.close()
      console.log(JSON.stringify(row).slice(0, 260))
    }
  }
  await b.close()
  writeFileSync(resolve(OUT, `measures${only ? '-' + only.join('+') : ''}.json`), JSON.stringify(rows, null, 1))
}

void main()
