/**
 * IA v4 prototype captures and checks (fifth order of 2026-11-22, step 3). Needs a production build served with the lab on:
 *   npm run build && DESIGN_LAB=1 PORT=3101 npm run start   then   npx tsx e2e-shots/ia4-shots.ts
 * Writes at most 12 JPEGs (q60) to docs/design/IA-v4/ and prints, per state: horizontal overflow, axe serious/critical count,
 * and the receipt slip's animation (ia4-feed with motion, none under reduced motion). Exit 1 on any failed check.
 */
import { chromium, type Page } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { resolve } from 'node:path'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../docs/design/IA-v4')
let failed = 0

async function check(page: Page, name: string, extra: Record<string, unknown> = {}) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const axe = await new AxeBuilder({ page }).analyze()
  const bad = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}(${v.nodes.length})`)
  if (overflow > 0 || bad.length) failed++
  console.log(JSON.stringify({ name, overflow, axeSeriousCritical: bad, ...extra }))
}
const shot = (page: Page, file: string) => page.screenshot({ path: resolve(OUT, file), type: 'jpeg', quality: 60 })

async function open(width: number, reduced: boolean, path: string) {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width, height: width >= 1024 ? 900 : 844 }, deviceScaleFactor: 1, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  const page = await ctx.newPage()
  await mock(page, false)
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  return { b, page }
}
const slipAnim = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('[data-testid=ia4-slip]')!).animationName)

async function main() {
  // marketing site
  for (const width of [1440, 390]) {
    const { b, page } = await open(width, false, '/design-lab/ia4/site')
    await shot(page, `site-${width}.jpg`); await check(page, `site ${width}`)
    if (width === 1440) {
      await page.locator('#demo').scrollIntoViewIfNeeded(); await page.waitForTimeout(400)
      await shot(page, 'site-demo-1440.jpg'); await check(page, 'site demo entry 1440')
    } else {
      await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(400)
      await shot(page, 'site-menu-390.jpg'); await check(page, 'site menu 390')
    }
    await b.close()
  }
  // app home
  for (const width of [1440, 390, 320]) {
    const { b, page } = await open(width, false, '/design-lab/ia4/app')
    const navItems = width >= 1024 ? await page.locator('.ia4-side nav a').count() : await page.locator('.ia4-bar > *').count()
    await shot(page, `app-home-${width}.jpg`); await check(page, `app home ${width}`, { navItems })
    if (width === 1440) {
      await page.getByTestId('ia4-chip').nth(1).click()
      await page.waitForTimeout(260)
      await shot(page, 'app-ask-printing-1440.jpg')
      const anim = await slipAnim(page)
      if (anim !== 'ia4-feed') failed++
      await page.waitForTimeout(900)
      await shot(page, 'app-ask-1440.jpg'); await check(page, 'app ask answer 1440', { slipAnimation: anim })
    }
    if (width === 390) {
      await page.getByRole('button', { name: 'More' }).click(); await page.waitForTimeout(400)
      await shot(page, 'app-more-390.jpg'); await check(page, 'app more sheet 390')
    }
    await b.close()
  }
  // reduced motion: the slip is finished at once (no animation)
  {
    const { b, page } = await open(390, true, '/design-lab/ia4/app')
    await page.getByTestId('ia4-chip').nth(0).click(); await page.waitForTimeout(40)
    const anim = await slipAnim(page)
    if (anim !== 'none') failed++
    await page.getByTestId('ia4-slip').scrollIntoViewIfNeeded()
    await shot(page, 'app-ask-390-reduced.jpg'); await check(page, 'app ask 390 reduced motion', { slipAnimation: anim })
    await b.close()
  }
  if (failed) { console.error(`FAIL: ${failed}`); process.exit(1) }
  console.log('PASS')
}
main().catch((e) => { console.error(e); process.exit(1) })
