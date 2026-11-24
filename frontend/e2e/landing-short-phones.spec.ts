import { expect, test } from '@playwright/test'

/**
 * Design v5 step 1 (decision D10): on a short phone the landing hero's headline block must not sit over the tape, its printed
 * label or the amounts list (AUDIT.md problem 1: at 393x659 the receipt overlapped the headline). Geometry check on the
 * finished frame, at the three short phone sizes the order names.
 */
const SIZES = [
  { name: 'iPhone 15 short', width: 393, height: 659 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'small Android', width: 360, height: 640 },
]

type Box = { top: number; bottom: number; left: number; right: number }

for (const s of SIZES) {
  test(`landing hero keeps the headline clear of the tape at ${s.width}x${s.height} (${s.name})`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height })
    await page.goto('/')
    await expect(page.locator('#hero-title')).toBeVisible()
    await page.waitForTimeout(800)
    const boxes = await page.evaluate(() => {
      const rect = (sel: string): Box | null => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return null
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right }
      }
      return {
        copy: rect('.fs-hero-copy'),
        h1: rect('#hero-title'),
        strip: rect('.fs-hero-strip'),
        label: rect('.fs-tape-label'),
        list: rect('.fs-hero-list'),
        hero: rect('.fs-hero'),
        docWidth: document.documentElement.scrollWidth,
      }
    })
    const copy = boxes.copy!
    for (const k of ['strip', 'label', 'list'] as const) {
      const b = boxes[k]
      if (!b) continue
      expect(b.bottom, `${k} must end above the headline block (${k} bottom ${b.bottom}, copy top ${copy.top})`).toBeLessThanOrEqual(copy.top + 0.5)
    }
    expect(boxes.hero!.bottom, 'the hero box contains its headline block').toBeGreaterThanOrEqual(copy.bottom - 0.5)
    expect(boxes.docWidth, 'no sideways scroll').toBeLessThanOrEqual(s.width)
  })
}
