import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Design v2 (2026-11-20): browser checks of the design lab, which now holds the chosen hero and overview compositions of
 * the prototype round (the A/B themes, the font specimen and the old lab hero were removed with direction A).
 *  - axe: 0 serious or critical violations on every lab page at a phone and a desktop width.
 *  - reduced motion: the hero tape shows its final frame at once and offers no animation controls.
 *  - the hero tape plays, can be skipped, and ends on the static frame with every story mark visible.
 */
const PAGES = [['index', '/design-lab'], ['dashboard', '/design-lab/dashboard'], ['hero', '/design-lab/hero']] as const

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
}

for (const [name, path] of PAGES) for (const width of [390, 1440]) {
  test(`${name} at ${width}px: no serious or critical violation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(path)
    await ready(page)
    if (name === 'hero') await page.getByRole('button', { name: 'Skip' }).click().catch(() => undefined)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}

test('reduced motion: the hero tape shows its final frame and offers no animation controls', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('/design-lab/hero')
  await ready(page)
  await expect(page.locator('.tape')).not.toHaveAttribute('data-armed', '')
  for (const el of await page.locator('.tape [data-story]').all()) expect(await el.evaluate((n) => getComputedStyle(n).opacity)).toBe('1')
  await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0)
  await ctx.close()
})

test('the hero tape plays, can be skipped, and ends on the static frame', async ({ page }) => {
  await page.goto('/design-lab/hero')
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible()
  for (const el of await page.locator('.tape [data-story]').all()) expect(await el.evaluate((n) => getComputedStyle(n).opacity)).toBe('1')
})
