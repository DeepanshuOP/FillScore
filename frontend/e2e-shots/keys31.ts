/**
 * Design v3.1 keyboard pass (orders of 2026-11-21, second): the month tape by keys, a pen margin note by keyboard focus
 * and Escape, the printed folds, the receipt from the ledger by Enter (plain entry: no motion on keyboard actions).
 * Every API call comes from mock.ts. Run against a production build on :3101:  npx tsx e2e-shots/keys31.ts
 */
import { chromium, type Page } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const results: Array<[string, boolean, string]> = []
const check = (name: string, ok: boolean, detail = '') => { results.push([name, ok, detail]) }
const active = (p: Page) => p.evaluate(() => {
  const a = document.activeElement as HTMLElement | null
  return { role: a?.getAttribute('role') ?? null, label: a?.getAttribute('aria-label') ?? null, desc: a?.getAttribute('aria-activedescendant') ?? null, text: a?.textContent?.slice(0, 40) ?? null }
})

async function main() {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await mock(page, false)
  await page.goto(BASE + '/dashboard?userId=demo-moderate', { waitUntil: 'networkidle' })
  await page.getByTestId('headline').waitFor({ timeout: 30000 })

  // 1. the tape by keys
  const tape = page.getByRole('listbox').first()
  await tape.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  let a = await active(page)
  check('tape: arrow keys pick an order', a.role === 'listbox' && !!a.desc, JSON.stringify(a))
  const first = a.desc
  await page.keyboard.press('End'); a = await active(page)
  check('tape: End picks the last order', !!a.desc && a.desc !== first, String(a.desc))
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter')
  await page.getByTestId('explain-replay').waitFor({ timeout: 15000 })
  const enter = await page.evaluate(() => (document.querySelector('.fs-r-shell') as HTMLElement | null)?.dataset.enter)
  check('tape: Enter opens the receipt with no motion from the bar', enter !== 'flip', `data-enter=${enter}`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  a = await active(page)
  check('receipt: Escape closes and returns focus to the tape', a.role === 'listbox' && (await page.locator('.fs-r-shell').count()) === 0, JSON.stringify(a))

  // 2. a pen margin note by keyboard focus, then Escape
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.locator('#total').focus().catch(() => {})
  await page.evaluate(() => window.scrollTo(0, 0))
  let found = false
  await page.keyboard.press('Tab')
  for (let i = 0; i < 40 && !found; i++) {
    found = await page.evaluate(() => document.activeElement?.hasAttribute('data-margin-note') ?? false)
    if (!found) await page.keyboard.press('Tab')
  }
  a = await active(page)
  await page.waitForTimeout(400)
  const noteOpen = await page.locator('.fs-note[data-state="open"]').count()
  const why = await page.evaluate(() => { const el = document.activeElement as HTMLElement; return `fv=${el.matches(':focus-visible')} expanded=${el.getAttribute('aria-expanded')} notes=${document.querySelectorAll('.fs-note').length} bodyPE=${document.body.style.pointerEvents}` })
  check('note: Tab reaches a pen mark and the note opens on focus', found && noteOpen === 1, `${a.label} open=${noteOpen} ${why}`)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  const afterEsc = await page.locator('.fs-note').count()
  a = await active(page)
  check('note: Escape closes it, focus stays on the mark, it does not reopen', afterEsc === 0 && !!a.label?.startsWith('Note:'), `${a.label} notes=${afterEsc}`)
  const mark = a.label
  await page.keyboard.press('Tab'); await page.waitForTimeout(250)
  a = await active(page)
  check('note: Tab moves on from the mark', a.label !== mark, `${mark} -> ${a.label ?? a.text}`)

  // 3. a printed fold by keyboard
  const lines = page.getByRole('button', { name: 'Lines' })
  await lines.focus(); await page.keyboard.press('Enter')
  check('fold: Enter opens "Lines"', (await lines.getAttribute('aria-expanded')) === 'true' && await page.getByTestId('orders-totals').isVisible())
  await page.keyboard.press('Enter')
  check('fold: Enter closes it again', (await lines.getAttribute('aria-expanded')) === 'false')

  // 4. the ledger: Enter on a row opens the receipt; the NOTES fold opens by keyboard
  await page.goto(BASE + '/dashboard?userId=demo-moderate&view=orders', { waitUntil: 'networkidle' })
  const row = page.locator('[data-testid=orders-row]').nth(2)
  await row.waitFor({ timeout: 30000 }); await row.focus(); await page.keyboard.press('Enter')
  await page.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 })
  const notes = page.getByTestId('receipt-notes').getByRole('button')
  await notes.focus(); await page.keyboard.press('Enter')
  check('receipt: NOTES opens by keyboard', (await notes.getAttribute('aria-expanded')) === 'true' && await page.getByTestId('receipt-notes').getByText(/SOURCE/).first().isVisible())
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  a = await active(page)
  check('receipt: Escape returns focus to the row', (await page.locator('.fs-r-shell').count()) === 0 && (a.text ?? '').length > 0, JSON.stringify(a))

  await b.close()
  for (const [n, ok, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d.slice(0, 120)})` : ''}`)
  console.log(`${results.filter((r) => r[1]).length}/${results.length} passed`)
}

void main()
