/**
 * Design v3.1 "Quiet audit" (orders of 2026-11-21, second): visible word counts per screen, before and after.
 * A word is a whitespace-separated token with at least one letter (figures such as $52.08 or 11.7 are counted apart as
 * figures). Counted: text that is laid out (box at least 2 x 2 px, so `sr-only` text is out), not `visibility: hidden`,
 * not opacity 0 on it or an ancestor, and not inside a closed disclosure. The landing page and the overview are counted
 * over the whole page (every viewport), the receipt inside its dialog or drawer. Every API call comes from mock.ts.
 * Run against a production build:  PORT=3101 npm run start   then   npx tsx e2e-shots/words.ts
 */
import { chromium, type Page } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'

async function count(page: Page, root: string) {
  return page.evaluate((sel) => {
    const top = document.querySelector(sel) ?? document.body
    let words = 0, figures = 0
    const sizes = new Set<number>()
    const w = document.createTreeWalker(top, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = w.nextNode())) {
      const t = (n.textContent ?? '').trim()
      if (!t) continue
      const el = n.parentElement
      if (!el || el.closest('script,style,noscript,[hidden],details:not([open]) > :not(summary)')) continue
      let hidden = false
      for (let a: HTMLElement | null = el; a; a = a.parentElement) {
        const cs = getComputedStyle(a)
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) { hidden = true; break }
        // sr-only and other clipped boxes: the text still has a rect, but nothing of it is painted
        const ab = a.getBoundingClientRect()
        if ((cs.overflow === 'hidden' || cs.clip !== 'auto' || cs.clipPath.startsWith('inset(50%')) && (ab.width <= 2 || ab.height <= 2)) { hidden = true; break }
      }
      if (hidden) continue
      const r = document.createRange(); r.selectNodeContents(n)
      const b = r.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      for (const tok of t.split(/\s+/)) {
        if (/[A-Za-z]/.test(tok)) words++
        else if (/\d/.test(tok)) figures++
      }
      sizes.add(Math.round(parseFloat(getComputedStyle(el).fontSize)))
    }
    return { words, figures, typeSizes: [...sizes].sort((a, b) => a - b) }
  }, root)
}

async function main() {
  const b = await chromium.launch()
  const out: Record<string, unknown> = {}
  for (const width of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await mock(page, false)
    await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
    out[`landing-${width}`] = await count(page, 'main')
    if (process.env.WORDS_SECTIONS) {
      const n = await page.locator('main > section').count()
      for (let i = 0; i < n; i++) out[`landing-${width}-s${i}`] = await count(page, `main > section:nth-of-type(${i + 1})`)
    }
    await page.goto(BASE + '/dashboard?userId=demo-moderate', { waitUntil: 'networkidle' })
    await page.getByTestId('headline').waitFor({ timeout: 30000 }); await page.waitForTimeout(2500)
    out[`overview-${width}`] = await count(page, '[data-view-body]')
    await page.goto(BASE + '/dashboard?userId=demo-moderate&view=orders', { waitUntil: 'networkidle' })
    await page.locator('[data-testid=orders-row]').nth(2).click()
    await page.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await page.waitForTimeout(1200)
    out[`receipt-${width}`] = await count(page, '[data-testid=explain-replay]')
    await ctx.close()
  }
  await b.close()
  console.log(JSON.stringify(out, null, 1))
}

void main()
