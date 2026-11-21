/**
 * Design v3 fixes A4 probe: the first ruled element under the section tabs and its gap to the tabs' rule.
 *   npx tsx e2e-shots/probe-rule.ts [signed|anon] <path>...   (production server on QA_BASE, default :3101)
 */
import { chromium } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
;(async () => {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await mock(page, process.argv[2] === 'signed')
  for (const path of process.argv.slice(3)) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const r = await page.evaluate(() => {
      const main = document.querySelector('#main'); const nav = document.querySelector('header nav[aria-label="App"]')
      if (!main || !nav) return 'no shell'
      const tabs = nav.parentElement!.getBoundingClientRect().bottom
      for (const el of main.querySelectorAll<HTMLElement>('*')) {
        const s = getComputedStyle(el); const rc = el.getBoundingClientRect()
        if (rc.height && parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && s.borderTopColor !== 'rgba(0, 0, 0, 0)') {
          const chain: string[] = []
          for (let a: HTMLElement | null = el; a && a !== main; a = a.parentElement) chain.push(`${a.tagName.toLowerCase()}.${String(a.className).split(' ').slice(0, 2).join('.')}`)
          return { gap: Math.round(rc.top - tabs), chain: chain.join(' < ') }
        }
      }
      return null
    })
    console.log(path, JSON.stringify(r))
  }
  await b.close()
})()
