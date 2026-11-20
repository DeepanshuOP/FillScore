/**
 * Keyboard-only pass (design v3 QA, break-ui routine): the overview's month tape, the order receipt and the verify page,
 * driven with the keyboard alone. Prints one line per step: PASS or FAIL with what was seen.
 *   npx tsx e2e-shots/keys.ts      (production server on QA_BASE, default http://localhost:3101)
 */
import { chromium, type Page } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const say = (ok: boolean, step: string, seen = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${seen ? `: ${seen}` : ''}`)

async function tabTo(page: Page, test: () => Promise<boolean>, max = 60): Promise<boolean> {
  for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (await test()) return true }
  return false
}

async function main() {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await mock(page, false)

  await page.goto(`${BASE}/dashboard?userId=demo-moderate`, { waitUntil: 'networkidle' })
  await page.getByText('Where the').first().waitFor()
  const onTape = await tabTo(page, async () => (await page.evaluate(() => document.activeElement?.getAttribute('role'))) === 'listbox')
  say(onTape, 'Tab reaches the month tape (one tab stop, role listbox)')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
  const active = await page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'))
  say(!!active, 'Arrow keys move the preview', active ?? 'none')
  const preview = await page.locator('text=Click or Enter prints the receipt').count()
  say(preview > 0, 'The receipt preview shows for the keyboard')
  await page.keyboard.press('Enter')
  await page.waitForURL(/view=orders.*order=/, { timeout: 10000 }).catch(() => undefined)
  say(/view=orders/.test(page.url()) && /order=/.test(page.url()), 'Enter opens the order in Orders', page.url().replace(BASE, ''))
  const receipt = await page.getByTestId('explain-replay').waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
  say(receipt, 'The receipt prints for the order named in the address')
  await page.keyboard.press('Escape')
  const closed = await page.getByTestId('explain-replay').waitFor({ state: 'detached', timeout: 5000 }).then(() => true).catch(() => false)
  say(closed, 'Escape tears the receipt off (closes it)')

  // a row opened with the keyboard returns focus to the row on close
  const onRow = await tabTo(page, async () => (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'orders-row', 80)
  say(onRow, 'Tab reaches an orders row')
  await page.keyboard.press('Enter')
  const opened = await page.getByTestId('explain-replay').waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
  say(opened, 'Enter on a row prints its receipt')
  const trapped = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  say(trapped, 'Focus moves into the receipt')
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  const back = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
  say(back === 'orders-row', 'Focus returns to the row after closing', String(back))

  await page.goto(`${BASE}/verify`, { waitUntil: 'networkidle' })
  const onFile = await tabTo(page, async () => (await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)) === 'file', 40)
  say(onFile, 'Tab reaches the pack file input on /verify')
  const visible = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const s = getComputedStyle(el); return s.outlineStyle !== 'none' && s.outlineWidth !== '0px' })
  say(visible, 'The focused file input shows a focus ring')
  await b.close()
}
void main()
