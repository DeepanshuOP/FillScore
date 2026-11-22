/**
 * Design v3.1 "Quiet audit" (orders of 2026-11-21, second): visible word counts per screen, before and after.
 * A word is a whitespace-separated token with at least one letter (figures such as $52.08 or 11.7 are counted apart as
 * figures). Counted: text that is laid out (box at least 2 x 2 px, so `sr-only` text is out), not `visibility: hidden`,
 * not opacity 0 on it or an ancestor, and not inside a closed disclosure. The landing page and the overview are counted
 * over the whole page (every viewport), the receipt inside its dialog or drawer. Every API call comes from mock.ts.
 * Run against a production build:  PORT=3101 npm run start   then   npx tsx e2e-shots/words.ts
 */
import { chromium, type Page } from 'playwright'
import { resolve } from 'node:path'
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

/**
 * Part B (orders of 2026-11-22, second): the other screens, same method. `WORDS_B=1 npx tsx e2e-shots/words.ts` counts each
 * screen below over its root element, at 1440 and 390, in the state the prepare step leaves (the idle state, then the state
 * after the main action where there is one). Calls the mock does not answer return 404, so a screen that needs more
 * reads its empty or error state; that is stated per screen in the milestone report.
 */
const DASH = '/dashboard?userId=demo-moderate'
const settle = async (p: Page) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1800) }
const B_SCREENS: Array<{ name: string; path: string; root: string; signedIn?: boolean; prepare?: (p: Page) => Promise<void> }> = [
  { name: 'orders', path: `${DASH}&view=orders`, root: '[data-view-body]', prepare: async (p) => { await p.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'rules', path: `${DASH}&view=rules`, root: '[data-view-body]', prepare: settle },
  { name: 'rankings', path: `${DASH}&view=rankings`, root: '[data-view-body]', prepare: async (p) => { await p.getByTestId('explain-rankings').getByText('RANK', { exact: true }).first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'council-idle', path: `${DASH}&view=council`, root: '[data-view-body]', prepare: settle },
  { name: 'council-run', path: `${DASH}&view=council`, root: '[data-view-body]', prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click(); await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1000) } },
  { name: 'evidence', path: `${DASH}&view=evidence`, root: '[data-view-body]', prepare: settle },
  { name: 'verify-idle', path: '/verify', root: 'main', prepare: settle },
  { name: 'verify-checked', path: '/verify', root: 'main', prepare: async (p) => {
    await p.locator('#pack').setInputFiles(resolve(__dirname, '../app/lib/__fixtures__/evidence-pack.json')).catch(() => {}); await p.locator('#trusted').fill('993a80b17c57a4ad').catch(() => {}); await p.waitForTimeout(1500) } },
  { name: 'onboarding', path: '/onboarding', root: 'main', signedIn: true, prepare: settle },
  { name: 'onboarding-refusal', path: '/onboarding', root: 'main', signedIn: true, prepare: async (p) => {
    await p.getByRole('button', { name: /Binance/ }).first().click()
    await p.getByLabel('API key', { exact: true }).fill('qa-demo-key'); await p.getByLabel('API secret', { exact: true }).fill('qa-demo-secret')
    await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Connect account' }).click()
    await p.getByText('The key was refused').waitFor({ timeout: 15000 }); await p.waitForTimeout(800) } },
  { name: 'settings', path: '/settings', root: 'main', signedIn: true, prepare: settle },
  { name: 'login', path: '/login', root: 'main', prepare: settle },
  { name: 'signup', path: '/signup', root: 'main', prepare: settle },
  { name: 'forgot-password', path: '/forgot-password', root: 'main', prepare: settle },
  { name: 'reset-password', path: '/reset-password?token=qa', root: 'main', prepare: settle },
  { name: 'verify-email', path: '/verify-email?token=qa', root: 'main', prepare: settle },
  { name: 'trades', path: '/trades?userId=demo-moderate', root: 'main', prepare: settle },
  { name: 'analytics', path: '/analytics?userId=demo-moderate', root: 'main', prepare: settle },
  { name: 'methodology', path: '/methodology', root: 'main', prepare: settle },
  { name: 'check', path: '/check', root: 'main', prepare: settle },
  { name: 'share', path: '/share/demo-moderate', root: 'main', prepare: settle },
  { name: 'privacy', path: '/privacy', root: 'main', prepare: settle },
  { name: 'terms', path: '/terms', root: 'main', prepare: settle },
  { name: 'not-found', path: '/no-such-page', root: 'body', prepare: settle },
]

async function mainB() {
  const b = await chromium.launch()
  const out: Record<string, unknown> = {}
  const only = process.env.WORDS_ONLY?.split(',')
  for (const width of [1440, 390]) {
    for (const s of B_SCREENS) {
      if (only && !only.includes(s.name)) continue
      const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await mock(page, !!s.signedIn)
      try {
        await page.goto(BASE + s.path, { waitUntil: 'networkidle', timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        await s.prepare?.(page)
        const c = await count(page, s.root) as { words: number; figures: number; typeSizes: number[] }
        out[`${s.name}-${width}`] = `${c.words} words, ${c.figures} figures, ${c.typeSizes.length} sizes (${c.typeSizes.join(' ')})`
      } catch (e) { out[`${s.name}-${width}`] = `error: ${String(e).slice(0, 120)}` }
      await ctx.close()
    }
  }
  await b.close()
  console.log(JSON.stringify(out, null, 1))
}

async function main() {
  if (process.env.WORDS_B) return mainB()
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
