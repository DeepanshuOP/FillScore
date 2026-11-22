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

  // 5. Part B (2026-11-22, second): Orders, Council, Verify, Onboarding by keys only
  // Orders: the panel's pen note opens on keyboard focus and closes on Escape; the Columns menu opens by Enter and adds a column
  await page.goto(BASE + '/dashboard?userId=demo-moderate&view=orders', { waitUntil: 'networkidle' })
  await page.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 })
  const noteBtn = page.getByRole('button', { name: 'Note: how to read the ledger' })
  await noteBtn.focus(); await page.waitForTimeout(500)
  check('orders: the pen note opens on keyboard focus', await page.getByText(/Select a row to print its receipt/).first().isVisible())
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  check('orders: Escape closes the note', (await page.getByText(/Select a row to print its receipt/).count()) === 0)
  const cols = page.getByRole('button', { name: /Columns/ })
  await cols.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  check('orders: the Columns menu opens by Enter', (await page.getByRole('menuitemcheckbox', { name: 'Order id' }).count()) === 1)
  await page.keyboard.press('Escape')
  // Council: the run button is reachable and starts the run by Enter; the cited-values fold opens by Enter
  await page.goto(BASE + '/dashboard?userId=demo-moderate&view=council', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Run analysis' }).focus(); await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: /^Explanation/ }).waitFor({ timeout: 30000 })
  const cited = page.getByRole('button', { name: /CITED FROM THE AUDIT/ }).first()
  await cited.focus(); await page.keyboard.press('Enter')
  check('council: the cited-values fold opens by keyboard', (await cited.getAttribute('aria-expanded')) === 'true' && await page.getByTestId('council-cited').first().getByRole('definition').first().isVisible().catch(() => false))
  // Verify: the pack input and the trusted key are reachable by Tab; the how-the-check-runs note opens by focus
  await page.goto(BASE + '/verify', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Note: how the check runs' }).focus(); await page.waitForTimeout(500)
  check('verify: the note opens on keyboard focus', await page.getByText(/not sent to FillScore/).first().isVisible())
  await page.keyboard.press('Escape')
  await page.locator('#pack').focus()
  check('verify: the file input takes focus', (await page.evaluate(() => document.activeElement?.id)) === 'pack')
  await page.locator('#trusted').focus(); await page.keyboard.type('993a80b17c57a4ad')
  check('verify: the trusted key takes typing', (await page.locator('#trusted').inputValue()) === '993a80b17c57a4ad')
  await b.close()
  const b2 = await chromium.launch()
  const p2 = await b2.newPage({ viewport: { width: 1440, height: 900 } })
  await mock(p2, true)
  await p2.goto(BASE + '/onboarding', { waitUntil: 'networkidle' })
  const bin = p2.getByRole('button', { name: /Binance/ }).first()
  await bin.focus(); await p2.keyboard.press('Enter'); await p2.getByLabel('API key', { exact: true }).waitFor({ timeout: 15000 })
  await p2.getByLabel('API key', { exact: true }).focus(); await p2.keyboard.type('qa-demo-key')
  await p2.getByLabel('API secret', { exact: true }).focus(); await p2.keyboard.type('qa-demo-secret')
  const box = p2.getByRole('checkbox'); await box.focus(); await p2.keyboard.press('Space')
  check('onboarding: the read-only checkbox is ticked by Space', await box.isChecked())
  await p2.getByRole('button', { name: 'Connect account' }).focus(); await p2.keyboard.press('Enter')
  await p2.getByText('The key was refused').waitFor({ timeout: 15000 })
  check('onboarding: the refusal is read out in full (corrections listed)', await p2.getByText(/Enable Reading/).first().isVisible())
  await b2.close()
  for (const [n, ok, d] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d.slice(0, 120)})` : ''}`)
  console.log(`${results.filter((r) => r[1]).length}/${results.length} passed`)
}

void main()
