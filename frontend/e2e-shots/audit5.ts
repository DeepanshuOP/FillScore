/**
 * Design v5 audit (orders of 2026-11-24, step 1). Measures every marketing and app page, per viewport and theme:
 *  - the smallest visible font size and the count of visible text nodes under 12 px (SVG text at its drawn size);
 *  - uppercase letter-spaced runs (letter-spacing over 0.5 px on all-caps text), and how many of them are under 12 px;
 *  - axe color-contrast at AA (every node axe flags, muted text included), and axe serious or critical rules;
 *  - "not computed", "insufficient data" and lone dash ("—", "–") cells and tiles;
 *  - on phones, tap targets under 44 px (buttons, links outside running text, inputs, tabs, summaries).
 * Every API call is answered from the offline demo fixtures (mock.ts): no database, no network.
 * Viewports: desktop-1440 (1440x900), desktop-1280 (1280x800), tablet-768 (768x1024) in Chromium; iphone-15 in WebKit and pixel-8 in
 * Chromium, both with touch, at device scale 1 (CSS px measurements do not depend on the scale).
 * Run against a production build:  npm run build && PORT=3101 npm run start
 *   npx tsx e2e-shots/audit5.ts <out-dir> [viewport,...] [light|dark|both]
 * AUDIT_BASE (default http://localhost:3101), AUDIT_PAGES=name,name and AUDIT_PREFIX (path prefix, e.g. /design-lab/v5) limit or redirect.
 * Writes <out-dir>/<page>-<viewport>-<theme>.jpg (viewport only, JPEG 55) and <out-dir>/report-<viewports>-<themes>.json.
 */
import { chromium, webkit, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mock } from './mock'

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3101'
const OUT = resolve(process.argv[2] ?? resolve(__dirname, '../../.work/audit5'))
mkdirSync(OUT, { recursive: true })
const D = '?userId=demo-moderate'

export type AuditPage = { name: string; path: string; signedIn?: boolean; ready: (p: Page) => Promise<void> }
const settle = async (p: Page) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200) }
const testid = (id: string, extra = 800) => async (p: Page) => { await p.getByTestId(id).first().waitFor({ timeout: 30000 }); await p.waitForTimeout(extra) }

export const PAGES: AuditPage[] = [
  { name: 'landing', path: '/', ready: async (p) => { await p.waitForTimeout(1500) } },
  { name: 'how-it-works', path: '/how-it-works', ready: async (p) => { await p.waitForTimeout(1500) } },
  { name: 'demo', path: '/demo', ready: testid('demo-total-bps') },
  { name: 'verify', path: '/verify', ready: settle },
  { name: 'docs', path: '/docs', ready: settle },
  { name: 'methodology', path: '/methodology', ready: settle },
  { name: 'login', path: '/login', ready: settle },
  { name: 'app-home', path: `/app${D}`, ready: testid('home-total', 1000) },
  // design v5 routes (step 8 of the 2026-11-25 orders): Costs, Flagged orders, Comparisons, AI review, Reports; Settings by section
  { name: 'app-costs', path: `/app/costs${D}`, ready: testid('costs-view', 1500) },
  // a table row on desktop and tablet, a card on phones: the visible one
  { name: 'app-orders', path: `/app/orders${D}`, ready: async (p) => { await p.locator('[data-testid=orders-row]:visible, [data-testid=orders-card]:visible').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'app-orders-receipt', path: `/app/orders${D}`, ready: async (p) => {
    await p.locator('[data-testid=orders-row]:visible, [data-testid=orders-card]:visible').nth(2).click()
    await p.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  } },
  { name: 'app-flagged', path: `/app/flagged${D}`, ready: testid('explain-panel') },
  { name: 'app-compare', path: `/app/compare${D}`, ready: testid('explain-rankings') },
  { name: 'app-review', path: `/app/review${D}`, ready: async (p) => {
    await p.getByRole('button', { name: 'Start review' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1000)
  } },
  { name: 'app-reports', path: `/app/reports${D}`, ready: testid('reports-card', 1000) },
  { name: 'app-fills', path: `/app/fills${D}`, ready: async (p) => { await p.getByText('TAKER').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'app-check', path: `/app/check${D}`, ready: settle },
  { name: 'app-settings', path: '/app/settings', signedIn: true, ready: settle },
  { name: 'app-settings-keys', path: '/app/settings?section=api-keys', signedIn: true, ready: settle },
  { name: 'app-settings-usage', path: '/app/settings?section=usage', signedIn: true, ready: settle },
  { name: 'app-settings-data', path: '/app/settings?section=data', signedIn: true, ready: settle },
  { name: 'app-settings-about', path: '/app/settings?section=about', signedIn: true, ready: settle },
  { name: 'app-connect', path: '/app/connect', signedIn: true, ready: settle },
]

type Vp = { name: string; phone: boolean; engine: 'chromium' | 'webkit'; ctx: BrowserContextOptions }
const pick = (d: BrowserContextOptions & { defaultBrowserType?: string }) => { const { defaultBrowserType: _b, ...rest } = d; return { ...rest, deviceScaleFactor: 1 } }
export const VIEWPORTS: Vp[] = [
  { name: 'desktop-1440', phone: false, engine: 'chromium', ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  { name: 'desktop-1280', phone: false, engine: 'chromium', ctx: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: 'tablet-768', phone: false, engine: 'chromium', ctx: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 } },
  { name: 'iphone-15', phone: true, engine: 'webkit', ctx: pick(devices['iPhone 15']) },
  { name: 'pixel-8', phone: true, engine: 'chromium', ctx: pick(devices['Pixel 8']) },
]

/** In-page measurements. Kept free of named inner functions (tsx would inject a helper page.evaluate cannot see). */
export async function measure(page: Page, phone: boolean) {
  return page.evaluate((isPhone) => {
    const out = { minFontPx: 999, under12: 0, under12Samples: [] as string[], capsRuns: 0, capsUnder12: 0, capsUnder12Outside: 0, capsSamples: [] as string[],
      notComputed: 0, insufficient: 0, dashes: 0, smallTargets: 0, targetSamples: [] as string[], textNodes: 0 }
    const seenCaps = new Set<Element>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim()
      const el = n.parentElement
      if (!text || !el) continue
      if (el.closest('script,style,noscript,template,.sr-only,[hidden]')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      let hidden = false
      for (let a: Element | null = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.opacity === '0' || s.display === 'none') { hidden = true; break } }
      if (hidden) continue
      let px = parseFloat(cs.fontSize)
      const svgText = el.closest('text') as SVGTextElement | null
      if (svgText && svgText.getScreenCTM) { const m = svgText.getScreenCTM(); if (m) px = px * Math.sqrt(m.a * m.a + m.b * m.b) }
      px = Math.round(px * 10) / 10
      out.textNodes++
      if (px < out.minFontPx) out.minFontPx = px
      if (px < 12) { out.under12++; if (out.under12Samples.length < 6) out.under12Samples.push(`${px}px "${text.slice(0, 28)}"`) }
      const ls = parseFloat(cs.letterSpacing) || 0
      const caps = cs.textTransform === 'uppercase' ? /[a-z]{2,}/i.test(text) : (/[A-Z]{3,}/.test(text) && !/[a-z]/.test(text))
      if (caps && ls > 0.5 && !seenCaps.has(el)) {
        seenCaps.add(el); out.capsRuns++
        // a printed object (receipt, stamp, envelope, slip, tape strip) may keep its caps; the rule is about the rest of the page
        if (px < 12) { out.capsUnder12++; if (!el.closest('.fs-receipt,.fs-stamp,.fs-word-stamp,.fs-paper,.fs-envelope,.fs-slip,.fs-strip,[data-printed]')) out.capsUnder12Outside++ }
        if (out.capsSamples.length < 6) out.capsSamples.push(`${px}px ls ${Math.round(ls * 10) / 10}px "${text.slice(0, 24)}"`)
      }
      if (/not computed/i.test(text)) out.notComputed++
      if (/insufficient data/i.test(text)) out.insufficient++
      if (text === '—' || text === '–') out.dashes++
    }
    if (isPhone) {
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=menuitem], [role=checkbox], [role=link]'
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        // a visually hidden control (the skip link, a file input behind its label button) is not a target; its visible label is measured
        if (el.classList.contains('sr-only') || el.closest('.sr-only')) continue
        // a checkbox or radio is tapped through its label: the label is the target
        const lab = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? el.closest('label') : null
        const r = (lab ?? el).getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"],[inert]')) continue
        // WCAG 2.5.8 exempts targets inside a sentence: a link set inline inside running text
        if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && /^(P|LI|SPAN|TD|DD)$/.test(el.parentElement.tagName)) continue
        if (r.width < 44 || r.height < 44) {
          out.smallTargets++
          if (out.targetSamples.length < 60) out.targetSamples.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}" .${String(el.className).split(/\s+/).slice(0, 3).join('.')}`)
        }
      }
    }
    if (out.minFontPx === 999) out.minFontPx = 0
    return out
  }, phone)
}

export async function axeCounts(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const contrast = r.violations.find((v) => v.id === 'color-contrast')
  return {
    contrastNodes: contrast?.nodes.length ?? 0,
    contrastSamples: (contrast?.nodes ?? []).slice(0, 4).map((n) => `${n.target.join(' ').slice(0, 60)} :: ${(n.any[0]?.message ?? '').slice(0, 90)}`),
    seriousRules: r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}:${v.nodes.length}`),
  }
}

async function main() {
  const vpNames = (process.argv[3] ?? VIEWPORTS.map((v) => v.name).join(',')).split(',')
  const themeArg = process.argv[4] ?? 'both'
  const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg]
  const only = process.env.AUDIT_PAGES?.split(',')
  const prefix = process.env.AUDIT_PREFIX ?? ''
  const results: Array<Record<string, unknown>> = []
  const browsers: Partial<Record<'chromium' | 'webkit', Browser>> = {}
  for (const vp of VIEWPORTS.filter((v) => vpNames.includes(v.name))) {
    // WebKit needs host libraries (GTK 4, GStreamer) that `npx playwright install-deps webkit` installs with sudo. Without them the
    // iPhone profile runs in Chromium (same viewport, user agent and touch) and every row says which engine measured it.
    let engine: 'chromium' | 'webkit' = vp.engine
    if (engine === 'webkit' && !browsers.webkit) {
      try { browsers.webkit = await webkit.launch() } catch { engine = 'chromium'; console.log('WebKit unavailable on this host: iphone-15 measured in Chromium') }
    }
    const b = browsers[engine] ??= await chromium.launch()
    for (const theme of themes) for (const pg of PAGES) {
      if (only && !only.includes(pg.name)) continue
      const ctx = await b.newContext({ ...vp.ctx, colorScheme: theme === 'dark' ? 'dark' : 'light' })
      const page = await ctx.newPage()
      // design v5: next-themes key "fs-theme-v5" holds "light" or "dark" (the old "fs-theme" held paper or carbon)
      await page.addInitScript((t) => localStorage.setItem('fs-theme-v5', t), theme)
      // layout shift of the page's own life (shifts right after a user input do not count), read after the measures below
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number }
        w.__cls = 0
        new PerformanceObserver((list) => { for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
      })
      await mock(page, !!pg.signedIn)
      const row: Record<string, unknown> = { page: pg.name, viewport: vp.name, theme, engine }
      try {
        await page.goto(BASE + prefix + pg.path, { waitUntil: 'networkidle', timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        await pg.ready(page)
        const file = `${pg.name}-${vp.name}-${theme}.jpg`
        await page.screenshot({ path: resolve(OUT, file), type: 'jpeg', quality: 55 })
        Object.assign(row, { image: file }, await measure(page, vp.phone), await axeCounts(page))
        row.cls = Math.round((await page.evaluate(() => (window as unknown as { __cls: number }).__cls)) * 1000) / 1000
      } catch (e) {
        row.error = String(e).slice(0, 200)
      }
      results.push(row)
      await ctx.close()
      console.log(JSON.stringify({ p: row.page, v: row.viewport, t: row.theme, min: row.minFontPx, u12: row.under12, caps: row.capsRuns, cc: row.contrastNodes, nc: row.notComputed, tap: row.smallTargets, err: row.error ? 1 : 0 }))
    }
  }
  for (const b of Object.values(browsers)) await b?.close()
  writeFileSync(resolve(OUT, `report-${vpNames.join('+')}-${themes.join('+')}.json`), JSON.stringify(results, null, 1))
}

if (require.main === module) void main()
