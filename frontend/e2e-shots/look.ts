/**
 * One quick look at a screen while building (design v3): a viewport JPEG (quality 60) in .work/look/ and the DOM checks.
 *   npx tsx e2e-shots/look.ts <name> <path> [widths=1440,390] [signed] [carbon] [click=<css>] [wait=<text>] [scroll=<px>] [reduce]
 * Needs a production server on QA_BASE (default http://localhost:3101).
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, mock } from './mock'

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
    await mock(page, flag('signed') !== undefined)
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    const wait = flag('wait'); if (wait) await page.getByText(wait).first().waitFor({ timeout: 30000 })
    const click = flag('click'); if (click) { await page.locator(click).first().click(); await page.waitForTimeout(1200) }
    const scroll = flag('scroll'); if (scroll) { await page.mouse.wheel(0, Number(scroll)); await page.waitForTimeout(1500) }
    await page.waitForTimeout(900)
    await page.screenshot({ path: resolve(OUT, `${name}-${width}.jpg`), type: 'jpeg', quality: 60 })
    console.log(JSON.stringify({ width, ...(await checks(page, name)) }))
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
