import { test, expect } from '@playwright/test'
import { storeDemoRunForCurrentData } from './db'

// Step 3 of the fourth order: the Council stream resumes. The first response is cut after four events (the page sees a
// stream that ends before `complete`); the page must continue with a GET carrying Last-Event-ID, show each note once,
// and never post the run again. The GET goes to the real ml-service, so this also proves its CORS allows the header.
test.beforeAll(async () => {
  await storeDemoRunForCurrentData('demo-moderate')
})

const CUT_AFTER = 4

test('demo Council: a stream cut mid-run resumes from the last event id, with no duplicate notes and no second run', async ({ page }) => {
  const posts: string[] = []
  const gets: { url: string; lastEventId: string | undefined }[] = []
  page.on('request', (r) => {
    if (r.url().includes('/ml/agents/council/stream')) {
      if (r.method() === 'POST') posts.push(r.url())
      if (r.method() === 'GET') gets.push({ url: r.url(), lastEventId: r.headers()['last-event-id'] })
    }
  })
  await page.route('**/ml/agents/council/stream', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const real = await route.fetch()
    const blocks = (await real.text()).split('\n\n').filter(Boolean)
    expect(blocks.length).toBeGreaterThan(CUT_AFTER)             // the whole run, so the cut really is mid-run
    const origin = route.request().headers()['origin'] ?? '*'
    await route.fulfill({
      status: 200,
      headers: {
        ...real.headers(),
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-expose-headers': 'X-Council-Run',
      },
      body: blocks.slice(0, CUT_AFTER).join('\n\n') + '\n\n',
    })
  })

  await page.goto('/dashboard?userId=demo-moderate&view=council')
  await page.getByRole('button', { name: 'Start review' }).click()
  const heading = page.getByRole('heading', { name: 'Explanation (language model; every number was checked against the audit)' })
  await expect(heading).toBeVisible({ timeout: 45_000 })

  // resumed, not restarted
  expect(posts).toHaveLength(1)
  expect(gets).toHaveLength(1)
  expect(gets[0].lastEventId).toBe(String(CUT_AFTER))
  expect(gets[0].url).toContain('userId=demo-moderate')

  // the same page as an uninterrupted run, each note once
  const notes = page.locator('[data-testid=council-notes] article')
  await expect(notes).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    await expect(notes.nth(i).locator('[data-testid=council-finding]')).toHaveCount(1)
  }
  // design v5 (PROPOSAL §4 row 14): the benchmark line is printed only when it was measured; for an account without a 5-minute VWAP the
  // line is absent (never an "insufficient data" line) and one method-note sentence says why. Either way the page is the same on resume.
  await expect(page.getByText(/Benchmark comparison: insufficient data/)).toHaveCount(0)
  const measured = await page.getByTestId('council-benchmark-line').count()
  if (measured) await expect(page.getByTestId('council-benchmark-line')).toHaveText(/^Market-order fills: median/)
  else await expect(page.getByText('No comparison with the 5-minute average price is shown')).toHaveCount(1)
  await expect(page.getByTestId('council-model-label')).toHaveText(/^Model's label, as recorded: /)
})
