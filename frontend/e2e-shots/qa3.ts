/**
 * Visual QA (design v3; states updated for IA v4 on 2026-11-23, sixth order, step 9). One script: every marketing page at 1440 and
 * 390, every app page at 1440, 390 and 320, Home, Overview, Orders and Council also in Carbon copy (1440), as viewport-only JPEGs
 * (quality 60) in .work/qa3/pass-N/, with DOM checks (horizontal overflow, elements past the viewport, overlapping text), axe
 * (0 serious or critical) and the landing page's CLS (must stay under 0.05).
 * Every API call is answered from fixtures (mock.ts): no database, no network.
 * Run against a production build:  npm run build && PORT=3101 npm run start   then   npx tsx e2e-shots/qa3.ts [pass]
 * QA_ONLY=name,name limits the states; QA_REDUCED=1 captures with prefers-reduced-motion (files end in -rm).
 */
import { chromium, type Page } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const PASS = process.argv[2] ?? '1'
const OUT = resolve(__dirname, '../../.work/qa3', `pass-${PASS}`)
mkdirSync(OUT, { recursive: true })
const PACK = resolve(__dirname, '../app/lib/__fixtures__/evidence-pack.json')

type State = { name: string; path: string; signedIn?: boolean; carbon?: boolean; only1440?: boolean; prepare: (p: Page) => Promise<void> }
const scrollTo = async (p: Page, y: number) => { await p.mouse.wheel(0, y); await p.waitForTimeout(1800) }
const D = '?userId=demo-moderate'
const settle = async (p: Page) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200) }
const receipt = async (p: Page, nth = 2) => {
  await p.locator('[data-testid=orders-row]').nth(nth).click()
  await p.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
}

const STATES: State[] = [
  // ---- the marketing site ----
  { name: 'landing-hero-start', path: '/', prepare: async (p) => { await p.waitForTimeout(600) } },
  // the end of the pinned story: scrolled through the pin, the tape at rest and every mark drawn
  { name: 'landing-hero-end', path: '/', prepare: async (p) => {
    const w = p.viewportSize()?.width ?? 1440
    await scrollTo(p, w < 600 ? 520 : 740); await scrollTo(p, w < 600 ? 520 : 740)
  } },
  { name: 'landing-story-end', path: '/', prepare: async (p) => {
    await scrollTo(p, 1200); await scrollTo(p, 900)
    await p.locator('.fs-end').scrollIntoViewIfNeeded(); await p.waitForTimeout(1600)
  } },
  ...([['landing-demos', '#demos-title'], ['landing-check', '#check-title'], ['landing-close', '#cta-title']] as const)
    .map(([name, sel]) => ({ name, path: '/', prepare: async (p: Page) => {
      await p.waitForTimeout(800)
      await p.evaluate((s) => { const el = document.querySelector(s) as HTMLElement | null; if (el) window.scrollTo(0, (el.closest('section') ?? el).getBoundingClientRect().top + scrollY - 140) }, sel)
      await p.waitForTimeout(2200)
    } })),
  { name: 'site-menu', path: '/demo', prepare: async (p) => { if ((p.viewportSize()?.width ?? 0) < 768) { await p.getByRole('button', { name: 'Menu' }).click(); await p.waitForTimeout(900) } else await settle(p) } },
  { name: 'demo', path: '/demo', prepare: async (p) => { await p.getByTestId('demo-total-bps').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'how-it-works', path: '/how-it-works', prepare: async (p) => { await p.waitForTimeout(1500) } },
  { name: 'how-it-works-mid', path: '/how-it-works', prepare: async (p) => {
    await p.waitForTimeout(800)
    await p.evaluate(() => { const el = document.querySelector('.fs-reads') as HTMLElement | null; const sp = el?.parentElement?.classList.contains('pin-spacer') ? el.parentElement : null; if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY + (sp ? (sp.offsetHeight - el.offsetHeight) * 0.5 : 0)) })
    await p.waitForTimeout(2200)
  } },
  { name: 'docs', path: '/docs', prepare: settle },
  { name: 'docs-mcp', path: '/docs/mcp', prepare: settle },
  { name: 'docs-package', path: '/docs/package', prepare: settle },
  { name: 'methodology', path: '/methodology', prepare: settle },
  { name: 'verify', path: '/verify', prepare: settle },
  { name: 'verify-checked', path: '/verify', prepare: async (p) => {
    await p.locator('#pack').setInputFiles(PACK); await p.locator('#trusted').fill('993a80b17c57a4ad')
    await p.getByText('Verification receipt').waitFor({ timeout: 15000 }); await p.locator('#trusted').blur(); await p.waitForTimeout(1500)
    await p.getByText('Verification receipt').scrollIntoViewIfNeeded(); await p.waitForTimeout(600)
  } },
  { name: 'login', path: '/login', prepare: settle },

  // ---- the app (also at 320) ----
  { name: 'app-home', path: `/app${D}`, prepare: async (p) => { await p.getByTestId('home-total').waitFor({ timeout: 30000 }); await p.waitForTimeout(1000) } },
  { name: 'app-home-ask', path: `/app${D}`, prepare: async (p) => { await p.getByTestId('home-total').waitFor({ timeout: 30000 }); await p.getByTestId('ask-chip').first().click(); await p.waitForTimeout(1200) } },
  { name: 'app-home-ask-last', path: `/app${D}`, prepare: async (p) => { await p.getByTestId('home-total').waitFor({ timeout: 30000 }); await p.getByTestId('ask-chip').last().click(); await p.waitForTimeout(1200) } },
  { name: 'app-home-signed-in', path: '/app', signedIn: true, prepare: async (p) => { await p.getByTestId('ask-panel').waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'app-more-sheet', path: `/app${D}`, prepare: async (p) => { if ((p.viewportSize()?.width ?? 0) < 1024) { await p.getByRole('button', { name: 'More' }).click(); await p.waitForTimeout(900) } else await settle(p) } },
  { name: 'app-overview', path: `/app/overview${D}`, prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  ...[2, 3, 4, 5].map((n) => ({ name: `app-overview-ch${n}`, path: `/app/overview${D}`, prepare: async (p: Page) => {
    await p.getByTestId('headline').waitFor({ timeout: 30000 }); await p.waitForTimeout(800)
    await p.evaluate((k) => { const el = document.querySelector(`[data-chapter="${k}"]`); if (el) window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 24) }, n)
    await p.waitForTimeout(1600)
  } })),
  { name: 'app-orders', path: `/app/orders${D}`, prepare: async (p) => { await p.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'app-orders-receipt', path: `/app/orders${D}`, prepare: async (p) => receipt(p) },
  // a cancelled order of the demo, opened by its id in the address (the phone's ledger has no Status column to pick it by)
  { name: 'app-orders-receipt-unfilled', path: `/app/orders${D}&order=ord-moderate-BTCUSDT-186102`, prepare: async (p) => {
    await p.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  } },
  { name: 'app-rules', path: `/app/rules${D}`, prepare: settle },
  { name: 'app-rankings', path: `/app/rankings${D}`, prepare: async (p) => { await p.getByTestId('explain-rankings').getByText('RANK', { exact: true }).first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'app-council', path: `/app/council${D}`, prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1000)
  } },
  { name: 'app-council-notes', path: `/app/council${D}`, prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(800)
    await p.evaluate(() => document.querySelector('[data-testid=council-notes]')?.scrollIntoView({ block: 'start' })); await p.waitForTimeout(600)
  } },
  { name: 'app-evidence', path: `/app/evidence${D}`, prepare: settle },
  { name: 'app-fills', path: `/app/fills${D}`, prepare: async (p) => { await p.getByTestId('fills-tabs').waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'app-fills-patterns', path: `/app/fills${D}&tab=patterns`, prepare: async (p) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500) } },
  { name: 'app-check', path: '/app/check', prepare: settle },
  { name: 'app-check-demo', path: `/app/check${D}`, prepare: settle },
  // A5 (seventh order): the sample file, signed out and in demo mode; the result is labelled
  { name: 'app-check-sample', path: '/app/check', prepare: async (p) => { await p.getByTestId('try-sample').click(); await p.getByTestId('sample-label').waitFor({ timeout: 15000 }); await p.waitForTimeout(800) } },
  { name: 'app-check-sample-demo', path: `/app/check${D}`, prepare: async (p) => { await p.getByTestId('try-sample').click(); await p.getByTestId('sample-label').waitFor({ timeout: 15000 }); await p.waitForTimeout(800) } },
  { name: 'app-settings', path: '/app/settings', signedIn: true, prepare: settle },
  { name: 'app-connect-refusal', path: '/app/connect', signedIn: true, prepare: async (p) => {
    await p.getByRole('button', { name: /Binance/ }).first().click()
    await p.getByLabel('API key', { exact: true }).fill('qa-demo-key'); await p.getByLabel('API secret', { exact: true }).fill('qa-demo-secret')
    await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Connect account' }).click()
    await p.getByText('The key was refused').waitFor({ timeout: 15000 }); await p.waitForTimeout(800)
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300)
  } },

  // ---- Carbon copy (1440) ----
  { name: 'carbon-home', path: `/app${D}`, carbon: true, only1440: true, prepare: async (p) => { await p.getByTestId('home-total').waitFor({ timeout: 30000 }); await p.getByTestId('ask-chip').first().click(); await p.waitForTimeout(1200) } },
  { name: 'carbon-fills', path: `/app/fills${D}`, carbon: true, only1440: true, prepare: async (p) => { await p.getByTestId('fills-tabs').waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'carbon-overview', path: `/app/overview${D}`, carbon: true, only1440: true, prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'carbon-orders-receipt', path: `/app/orders${D}`, carbon: true, only1440: true, prepare: async (p) => receipt(p) },
  { name: 'carbon-council', path: `/app/council${D}`, carbon: true, only1440: true, prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1000)
  } },
]

const isApp = (s: State) => s.path.startsWith('/app')

async function landingCls(width: number): Promise<number> {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width, height: width < 600 ? 844 : 900 } })
  await mock(page, false)
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(5000)
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
  await b.close()
  return cls
}

async function main() {
  const only = process.env.QA_ONLY?.split(',')
  const results: unknown[] = []
  const b = await chromium.launch()
  for (const width of [1440, 390, 320]) {
    for (const s of STATES) {
      if ((s.only1440 && width !== 1440) || (width === 320 && !isApp(s)) || (only && !only.includes(s.name))) continue
      const ctx = await b.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: process.env.QA_REDUCED ? 'reduce' : 'no-preference' })
      const page = await ctx.newPage()
      if (s.carbon) await page.addInitScript(() => localStorage.setItem('fs-theme', 'carbon'))
      await mock(page, !!s.signedIn)
      try {
        await page.goto(BASE + s.path, { waitUntil: 'networkidle', timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        await s.prepare(page)
        await page.screenshot({ path: resolve(OUT, `${s.name}-${width}${process.env.QA_REDUCED ? '-rm' : ''}.jpg`), type: 'jpeg', quality: 60 })
        results.push({ width, ...(await checks(page, s.name)) })
      } catch (e) {
        results.push({ width, name: s.name, error: String(e).slice(0, 200) })
      }
      await ctx.close()
    }
  }
  await b.close()
  const cls = { 1440: await landingCls(1440), 390: await landingCls(390) }
  const report = { pass: PASS, landingCls: cls, results }
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 1))
  const bad = (results as Array<Record<string, unknown>>).filter((r) => r.error || (r.overflow as number) > 0 || (r.wide as unknown[])?.length || (r.overlaps as unknown[])?.length || (r.axe as unknown[])?.length)
  console.log(JSON.stringify({ landingCls: cls, states: results.length, withProblems: bad.length }))
  for (const r of bad) console.log(JSON.stringify(r).slice(0, 400))
}

void main()
