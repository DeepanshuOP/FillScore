import { expect, test } from '@playwright/test'

/**
 * M8 phase 2a: the design lab answers 404 in a production build. This suite runs the production build without
 * DESIGN_LAB, exactly as a deployed site would run. (playwright.lab.config.ts runs the lab with DESIGN_LAB=1.)
 */
// design v2: the lab now holds the chosen hero and overview of the prototype round; /design-lab/fonts was removed
// (it stays in the list: a removed path must also not be served).
// design v3: the v2 round (/design-lab/dashboard, /design-lab/hero) was deleted; they stay in the list, and the v3 pages join it.
// IA v4 (2026-11-22, fifth order): the prototype pages join the list. The prototype was deleted when IA v4 was built (2026-11-23, sixth
// order, step 3: production replaced it); its paths stay in the list, as a removed path must also not be served.
for (const path of ['/design-lab', '/design-lab/dashboard', '/design-lab/hero', '/design-lab/fonts', '/design-lab/v3', '/design-lab/v3/tape/overview',
  '/design-lab/ia4', '/design-lab/ia4/site', '/design-lab/ia4/app',
  // design v5 (2026-11-24, step 6): the prototype's pages
  '/design-lab/v5', '/design-lab/v5/app', '/design-lab/v5/app/overview', '/design-lab/v5/app/orders', '/design-lab/v5/app/fills', '/design-lab/v5/app/check']) {
  test(`${path} is not found in production`, async ({ request }) => {
    const res = await request.get(path)
    expect(res.status()).toBe(404)
    expect(await res.text()).not.toContain('data-ui-lab')
  })
}
