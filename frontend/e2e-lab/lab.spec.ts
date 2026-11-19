import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * M8 phase 2a, browser checks of the design lab.
 *  - axe: 0 serious or critical violations on every lab page, in both directions, at a phone and a desktop width.
 *  - tabular figures: the specimen page measures the digit widths in this browser; a true tabular feature gives 0.00 px.
 *  - reduced motion: the hero shows its final frame at once and offers no animation controls.
 *  - screenshots: only when LAB_SHOTS=<dir> is set (they are the evidence for the choice, not a CI artefact).
 */
const THEMES = ['a', 'b'] as const
const PAGES = [['components', '/design-lab'], ['dashboard', '/design-lab/dashboard'], ['hero', '/design-lab/hero'], ['fonts', '/design-lab/fonts']] as const
const WIDTHS = [390, 834, 1440] as const
const SHOTS = process.env.LAB_SHOTS

async function ready(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
}

test.describe('axe', () => {
  for (const theme of THEMES) for (const [name, path] of PAGES) for (const width of [390, 1440]) {
    test(`${name}, direction ${theme}, ${width}px: no serious or critical violation`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${path}?theme=${theme}`)
      await ready(page)
      if (name === 'hero') await page.getByRole('button', { name: 'Skip the animation' }).click().catch(() => undefined)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    })
  }
})

test('the lab is served here (DESIGN_LAB=1) and carries no production footer', async ({ page }) => {
  const res = await page.goto('/design-lab')
  expect(res?.status()).toBe(200)
  await expect(page.locator('body > footer')).toBeHidden()
  await expect(page.locator('[data-ui-theme="a"]')).toBeVisible()
})

test('the dashboard headline total carries no "measured" marker: a demo total includes fees stated at the published rate', async ({ page }) => {
  await page.goto('/design-lab/dashboard?theme=a')
  await ready(page)
  const headline = page.locator('#headline')
  await expect(headline).toContainText('paid $52.08 in total')
  await expect(headline.locator('[data-state]')).toHaveCount(0)
  // the measured part is its own figure, with the marker; the fees are named as not independently measured
  await expect(page.locator('[data-state="measured"][aria-label^="Measured part of the total: $10.10"]')).toBeVisible()
  await expect(page.getByText('Fees at the published rate, not independently measured')).toBeVisible()
})

test('placeholders and inactive tabs keep their contrast: no browser opacity on top of the token colour', async ({ page }) => {
  for (const theme of ['a', 'b']) {
    await page.goto(`/design-lab?theme=${theme}`)
    await ready(page)
    const ph = await page.locator('input[placeholder="Main account"]').evaluate((el) => {
      const s = getComputedStyle(el, '::placeholder')
      return { color: s.color, opacity: s.opacity }
    })
    const ink = await page.locator('[data-ui-theme]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--ui-graphite').trim())
    expect(ph.opacity, `placeholder opacity in ${theme}`).toBe('1')
    const hex = ink.replace('#', '')
    const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`
    expect(ph.color, `placeholder colour in ${theme}`).toBe(rgb)
  }
})

test('tabular figures: the proposed families measure 0.00 px of digit-width spread; the result of each is printed', async ({ page }) => {
  await page.goto('/design-lab/fonts?theme=a')
  await ready(page)
  const names = ['IBM Plex Sans', 'Hanken Grotesk', 'Schibsted Grotesk']
  const results = page.getByTestId('tabular-result')
  await expect(results).toHaveCount(3)
  const texts: string[] = []
  for (let i = 0; i < 3; i++) {
    await expect(results.nth(i)).toContainText('tabular figures')
    texts.push(`${names[i]}: ${(await results.nth(i).innerText()).trim()}`)
  }
  console.log(texts.join('\n'))
  // The two proposed families must be truly tabular. Schibsted Grotesk is printed above and is not proposed: it measured 1.00 px.
  expect(texts[0]).toMatch(/tabular figures 0\.00 px/)
  expect(texts[1]).toMatch(/tabular figures 0\.00 px/)
})

test('reduced motion: the hero renders its final frame and offers no animation controls', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('/design-lab/hero?theme=a')
  await ready(page)
  const opacities = await page.$$eval('svg:not(.md\\:hidden) [data-h]', (els) => els.map((e) => getComputedStyle(e).opacity))
  expect(opacities.length).toBeGreaterThan(30)
  // every drawn element is visible; the sweep hairline (which exists only while playing) is not
  const sweeps = await page.$$eval('svg:not(.md\\:hidden) [data-h="sweep"]', (els) => els.map((e) => getComputedStyle(e).opacity))
  expect(sweeps).toEqual(['0'])
  const drawn = await page.$$eval('svg:not(.md\\:hidden) [data-h]:not([data-h="sweep"])', (els) => els.map((e) => getComputedStyle(e).opacity))
  expect(drawn.every((o) => o === '1')).toBe(true)
  expect(opacities.length).toBeGreaterThan(30)
  await expect(page.getByRole('button', { name: 'Skip the animation' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'How this was measured' })).toBeVisible()
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: join(SHOTS, 'hero-a-reduced-motion-1440.png'), fullPage: true }) }
  await ctx.close()
})

test('the hero plays, can be skipped, and ends on the static frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/design-lab/hero?theme=a')
  await ready(page)
  const skip = page.getByRole('button', { name: 'Skip the animation' })
  await expect(skip).toBeVisible()
  await skip.click()
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible()
  const opacities = await page.$$eval('svg:not(.md\\:hidden) [data-h]', (els) => els.map((e) => [e.getAttribute('data-h'), getComputedStyle(e).opacity]))
  expect(opacities.filter(([h, o]) => h !== 'sweep' && o !== '1')).toEqual([])
})

test.describe('screenshots', () => {
  test.skip(!SHOTS, 'set LAB_SHOTS=<dir> to write the screenshots')
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const [name, path] of PAGES.filter(([n]) => n === 'components' || n === 'dashboard')) {
        test(`${name} ${theme} ${width}`, async ({ page }) => {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(`${path}?theme=${theme}`)
          await ready(page)
          mkdirSync(SHOTS!, { recursive: true })
          await page.screenshot({ path: join(SHOTS!, `${name}-${theme}-${width}.png`), fullPage: true })
        })
      }
    }
    for (const [label, p] of [['start', 0], ['middle', 0.5], ['end', 1]] as const) {
      test(`hero ${theme} ${label}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.goto(`/design-lab/hero?theme=${theme}&freeze=${p}`)
        await ready(page)
        mkdirSync(SHOTS!, { recursive: true })
        await page.screenshot({ path: join(SHOTS!, `hero-${theme}-${label}-1440.png`), fullPage: true })
      })
    }
    test(`hero ${theme} end 390`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 })
      await page.goto(`/design-lab/hero?theme=${theme}&freeze=1`)
      await ready(page)
      mkdirSync(SHOTS!, { recursive: true })
      await page.screenshot({ path: join(SHOTS!, `hero-${theme}-end-390.png`), fullPage: true })
    })
    test(`fonts ${theme} 1440`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.goto(`/design-lab/fonts?theme=${theme}`)
      await ready(page)
      mkdirSync(SHOTS!, { recursive: true })
      await page.screenshot({ path: join(SHOTS!, `fonts-${theme}-1440.png`), fullPage: true })
    })
  }
})
