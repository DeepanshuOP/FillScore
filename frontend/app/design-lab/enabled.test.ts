/** The design lab answers 404 in production (orders of 2026-11-19) and is never listed in a sitemap. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { designLabEnabled } from './enabled'

describe('designLabEnabled', () => {
  it('is off in production, whatever else is set', () => {
    expect(designLabEnabled({ NODE_ENV: 'production' })).toBe(false)
    expect(designLabEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(false)
    expect(designLabEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'production', DESIGN_LAB: '1' })).toBe(false)   // a deployed production site never serves it
    expect(designLabEnabled({ NODE_ENV: 'production', DESIGN_LAB: 'true' })).toBe(false)                          // only the exact value 1 opens it
  })
  it('is on in development and tests, and in a local production build with DESIGN_LAB=1 (the screenshots)', () => {
    expect(designLabEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(designLabEnabled({ NODE_ENV: 'test' })).toBe(true)
    expect(designLabEnabled({ NODE_ENV: 'production', DESIGN_LAB: '1' })).toBe(true)
    expect(designLabEnabled({ NODE_ENV: 'production', VERCEL_ENV: 'preview', DESIGN_LAB: '1' })).toBe(true)
  })
})

describe('the lab is not published', () => {
  const app = resolve(__dirname, '..')
  it('no sitemap lists it', () => {
    for (const name of readdirSync(app).filter((n) => /^sitemap\./.test(n))) expect(readFileSync(join(app, name), 'utf8')).not.toContain('design-lab')
    for (const p of [resolve(app, '..', 'public', 'sitemap.xml'), resolve(app, '..', 'public', 'robots.txt')]) {
      if (existsSync(p)) expect(readFileSync(p, 'utf8')).not.toContain('design-lab')
    }
  })
  it('the layout refuses with notFound() when disabled and asks search engines not to index', () => {
    const layout = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/designLabEnabled\(\)/)
    expect(layout).toMatch(/notFound\(\)/)
    expect(layout).toMatch(/index:\s*false/)
    expect(layout).toMatch(/dynamic\s*=\s*'force-dynamic'/)
  })
})
