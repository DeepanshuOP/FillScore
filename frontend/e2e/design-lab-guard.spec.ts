import { expect, test } from '@playwright/test'

/**
 * M8 phase 2a: the design lab answers 404 in a production build. This suite runs the production build without
 * DESIGN_LAB, exactly as a deployed site would run. (playwright.lab.config.ts runs the lab with DESIGN_LAB=1.)
 */
for (const path of ['/design-lab', '/design-lab/dashboard', '/design-lab/hero', '/design-lab/fonts']) {
  test(`${path} is not found in production`, async ({ request }) => {
    const res = await request.get(path)
    expect(res.status()).toBe(404)
    expect(await res.text()).not.toContain('data-ui-lab')
  })
}
