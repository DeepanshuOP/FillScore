/**
 * Design v3 visual QA (orders of 2026-11-20, second). One script: every state at 1440 and 390, plus the overview and the
 * receipt in Carbon copy, as viewport-only JPEGs (quality 60) in .work/qa3/pass-N/, with DOM checks (horizontal overflow,
 * elements past the viewport, overlapping text), axe (0 serious or critical) and the landing page's CLS.
 * Every API call is answered from fixtures (mock.ts): no database, no network.
 * Run against a production build:  npm run build && PORT=3101 npm run start   then   npx tsx e2e-shots/qa3.ts [pass]
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

const STATES: State[] = [
  { name: 'landing-hero-start', path: '/', prepare: async (p) => { await p.waitForTimeout(600) } },
  // the end of the pinned story: scrolled through the pin, the tape at rest and every mark drawn
  { name: 'landing-hero-end', path: '/', prepare: async (p) => {
    // the pin lasts 1500 px on a desktop and 1100 px on a phone: stop just before it releases
    const w = p.viewportSize()?.width ?? 1440
    await scrollTo(p, w < 600 ? 520 : 720); await scrollTo(p, w < 600 ? 520 : 720)
  } },
  { name: 'landing-story-end', path: '/', prepare: async (p) => {
    await scrollTo(p, 1200); await scrollTo(p, 900)
    await p.locator('.fs-end').scrollIntoViewIfNeeded(); await p.waitForTimeout(1600)
  } },
  { name: 'overview', path: '/dashboard?userId=demo-moderate', prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'orders-receipt', path: '/dashboard?userId=demo-moderate&view=orders', prepare: async (p) => {
    await p.locator('[data-testid=orders-row]').nth(2).click()
    await p.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  } },
  { name: 'rankings', path: '/dashboard?userId=demo-moderate&view=rankings', prepare: async (p) => { await p.getByTestId('explain-rankings').getByText('RANK', { exact: true }).first().waitFor({ timeout: 30000 }); await p.waitForTimeout(800) } },
  { name: 'council', path: '/dashboard?userId=demo-moderate&view=council', prepare: async (p) => {
    await p.getByRole('button', { name: 'Run analysis' }).click()
    await p.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 }); await p.waitForTimeout(1000)
  } },
  { name: 'verify-checked', path: '/verify', prepare: async (p) => {
    await p.locator('#pack').setInputFiles(PACK); await p.locator('#trusted').fill('993a80b17c57a4ad')
    await p.getByText('Verification receipt').waitFor({ timeout: 15000 }); await p.waitForTimeout(1500)
    await p.getByText('Verification receipt').scrollIntoViewIfNeeded(); await p.waitForTimeout(600)
  } },
  { name: 'onboarding-refusal', path: '/onboarding', signedIn: true, prepare: async (p) => {
    await p.getByRole('button', { name: /Binance/ }).first().click()
    await p.getByLabel('API key', { exact: true }).fill('qa-demo-key'); await p.getByLabel('API secret', { exact: true }).fill('qa-demo-secret')
    await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Connect account' }).click()
    await p.getByText('The key was refused').waitFor({ timeout: 15000 }); await p.waitForTimeout(800)
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300)
  } },
  { name: 'settings', path: '/settings', signedIn: true, prepare: async (p) => { await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200) } },
  { name: 'overview-carbon', path: '/dashboard?userId=demo-moderate', carbon: true, only1440: true, prepare: async (p) => { await p.getByText('Where the').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(1200) } },
  { name: 'receipt-carbon', path: '/dashboard?userId=demo-moderate&view=orders', carbon: true, only1440: true, prepare: async (p) => {
    await p.locator('[data-testid=orders-row]').nth(2).click()
    await p.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 }); await p.waitForTimeout(1200)
  } },
]

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
  for (const width of [1440, 390]) {
    for (const s of STATES) {
      if ((s.only1440 && width !== 1440) || (only && !only.includes(s.name))) continue
      const ctx = await b.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      if (s.carbon) await page.addInitScript(() => localStorage.setItem('fs-theme', 'carbon'))
      await mock(page, !!s.signedIn)
      try {
        await page.goto(BASE + s.path, { waitUntil: 'networkidle', timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        await s.prepare(page)
        await page.screenshot({ path: resolve(OUT, `${s.name}-${width}.jpg`), type: 'jpeg', quality: 60 })
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
  console.log(JSON.stringify({ landingCls: cls }))
  for (const r of results as Array<Record<string, unknown>>) console.log(JSON.stringify(r).slice(0, 300))
}

void main()
