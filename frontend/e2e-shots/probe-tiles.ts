/**
 * Design v3 fixes A6 probe: the text boxes inside the landing hero's fill tiles and their neighbours, relative to each
 * tile, at a phone width. Gives the bounds heroGeometry.test.ts checks the pen loops against.
 *   npx tsx e2e-shots/probe-tiles.ts [width=390]   (production server on QA_BASE, default :3101)
 */
import { chromium } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
;(async () => {
  const width = Number(process.argv[2] ?? 390)
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' })
  await mock(page, false)
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const out = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLElement>('.fs-e')].filter((t) => t.getBoundingClientRect().width > 0)
    const i = tiles.findIndex((t) => t.dataset.kind === 'fill')
    return tiles.slice(i - 1, i + 4).map((t) => {
      const r = t.getBoundingClientRect()
      const range = document.createRange(); range.selectNodeContents(t)
      const tr = range.getBoundingClientRect()
      return { kind: t.dataset.kind, w: Math.round(r.width), h: Math.round(r.height),
        text: [Math.round(tr.left - r.left), Math.round(tr.top - r.top), Math.round(tr.right - r.left), Math.round(tr.bottom - r.top)] }
    })
  })
  console.log(JSON.stringify(out))
  await b.close()
})()
