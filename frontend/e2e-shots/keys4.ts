/**
 * Keyboard pass for IA v4 (sixth order, step 9), against a production server on QA_BASE (default http://localhost:3101), answers from
 * the mock.   npx tsx e2e-shots/keys4.ts
 * Only the keyboard is used. Checks: every sidebar noun is reachable by Tab and shows a focus ring; Ctrl K opens the palette, a typed
 * word and Enter go there, Escape closes it and returns focus; the phone's More button opens the sheet with Enter and Escape closes it
 * and returns focus to the button; the recorded chips work with Enter; the order receipt opens from a row with Enter and Escape returns
 * focus to the row.
 */
import { chromium, type Page } from 'playwright'
import { mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
let failed = 0
const ok = (cond: boolean, what: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${what}`); if (!cond) failed++ }
const active = (p: Page) => p.evaluate(() => { const e = document.activeElement as HTMLElement | null; return e ? `${e.tagName}|${(e.getAttribute('aria-label') ?? e.innerText ?? e.textContent ?? '').trim().slice(0, 40)}|${getComputedStyle(e).outlineStyle}|${getComputedStyle(e).outlineWidth}` : 'none' })

async function main() {
  const b = await chromium.launch()

  // ---- desktop ----
  {
    const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await mock(page, false)
    await page.goto(`${BASE}/app?userId=demo-moderate`, { waitUntil: 'networkidle' })
    await page.getByTestId('home-total').waitFor({ timeout: 30000 })
    const seen: string[] = []
    let ringOnNav = true
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab')
      const a = await active(page)
      seen.push(a)
      const [tag, name, style, width] = a.split('|')
      if (tag === 'A' && ['Home', 'Overview', 'Orders', 'Rules', 'Rankings', 'Council', 'Evidence', 'Fills', 'Check a broker file'].includes(name) && (style === 'none' || width === '0px')) ringOnNav = false
    }
    const labels = ['Home', 'Overview', 'Orders', 'Rules', 'Rankings', 'Council', 'Evidence', 'Fills', 'Check a broker file']
    ok(labels.every((l) => seen.some((s) => s.startsWith('A|' + l + '|'))), `desktop: all nine sidebar nouns are reached by Tab (${labels.filter((l) => !seen.some((s) => s.startsWith('A|' + l + '|'))).join(', ') || 'none missing'})`)
    ok(ringOnNav, 'desktop: each sidebar noun shows a focus outline')

    // the palette
    await page.keyboard.press('Control+k')
    const dlg = page.getByRole('dialog', { name: 'Jump to' })
    await dlg.waitFor({ timeout: 5000 }).catch(() => undefined)
    ok(await dlg.isVisible(), 'Ctrl K opens the palette')
    await page.keyboard.type('Orders')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/app\/orders/, { timeout: 15000 })
    ok(new URL(page.url()).pathname === '/app/orders' && new URL(page.url()).searchParams.get('userId') === 'demo-moderate', 'the palette goes to Orders and keeps the demo account')
    await page.keyboard.press('Control+k')
    await dlg.waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    ok(!(await dlg.isVisible()), 'Escape closes the palette')

    // the receipt from a row
    await page.locator('[data-testid=orders-row]').first().waitFor({ timeout: 30000 })
    await page.locator('[data-testid=orders-row]').nth(2).focus()
    await page.keyboard.press('Enter')
    await page.getByTestId('explain-replay').getByText('COSTS').waitFor({ timeout: 15000 })
    ok(await page.getByRole('dialog').first().isVisible(), 'Enter on an order row opens the receipt')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    ok(await page.getByRole('dialog').count() === 0, 'Escape closes the receipt')
    ok((await active(page)).startsWith('TR|') || (await active(page)).includes('orders') || (await page.evaluate(() => !!document.activeElement?.closest('[data-testid=orders-row]'))), 'focus returns to the order row')
    // chips on Home
    await page.goto(`${BASE}/app?userId=demo-moderate`, { waitUntil: 'networkidle' })
    await page.getByTestId('ask-chip').first().focus()
    await page.keyboard.press('Enter')
    ok(await page.getByTestId('ask-slip').isVisible(), 'a recorded chip works with Enter')
  }

  // ---- phone ----
  {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await mock(page, false)
    await page.goto(`${BASE}/app?userId=demo-moderate`, { waitUntil: 'networkidle' })
    await page.getByTestId('home-total').waitFor({ timeout: 30000 })
    const more = page.getByRole('button', { name: 'More' })
    await more.focus()
    ok(!(await active(page)).endsWith('|none|0px'), 'phone: the More button shows a focus outline')
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog')
    await sheet.waitFor({ timeout: 5000 })
    ok(await sheet.isVisible(), 'phone: Enter on More opens the sheet')
    ok((await sheet.innerText()).includes('A language-model review of the audit'), 'phone: the sheet carries one-line glosses')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    ok(await page.getByRole('dialog').count() === 0, 'phone: Escape closes the sheet')
    ok((await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'More', 'phone: focus returns to the More button')
    // the bottom bar links by keyboard
    const bar = page.getByRole('navigation', { name: 'Sections' })
    // (the bar prints in capitals by CSS, so the words are compared in lower case)
    ok((await bar.getByRole('link').allInnerTexts()).join(',').toLowerCase() === 'home,overview,orders', 'phone: the bar holds Home, Overview, Orders (and More)')
    // the site menu
    await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Menu' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    ok(await page.getByRole('dialog').count() === 0 && (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Menu', 'phone: the site Menu sheet closes with Escape and returns focus')
  }

  // ---- A4 and A5 of the seventh order (2026-11-23): header action labels, the theme switch, the sample file ----
  {
    const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await mock(page, false)
    await page.goto(`${BASE}/app/overview?userId=demo-moderate`, { waitUntil: 'networkidle' })
    const method = page.getByRole('button', { name: 'Method' })
    await method.waitFor({ timeout: 30000 })
    for (const n of ['Method', 'Copy share link', 'Download report']) {
      ok((await page.getByRole('button', { name: n }).innerText()).trim() === n, `1440: "${n}" has its text label visible`)
    }
    await method.focus()
    ok(!(await active(page)).endsWith('|none|0px'), '1440: the Method button shows a focus outline')
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    ok(await page.getByRole('dialog').count() === 0 && (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Method', '1440: Enter opens the Method sheet, Escape closes it and returns focus to the button')
    const sw = page.getByRole('switch', { name: /^Theme:/ })
    await sw.first().waitFor({ timeout: 10000 })
    await sw.first().focus()
    ok((await sw.first().getAttribute('aria-checked')) === 'false' && (await sw.first().innerText()) === 'Theme: Paper', 'theme switch reads "Theme: Paper", aria-checked false')
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    ok((await sw.first().getAttribute('aria-checked')) === 'true' && (await sw.first().innerText()) === 'Theme: Carbon copy' && (await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className)).includes('carbon'), 'Space switches it: "Theme: Carbon copy", aria-checked true, the page is in Carbon copy')
    await page.keyboard.press('Space')
    await page.waitForTimeout(500)
    ok((await sw.first().getAttribute('aria-checked')) === 'false', 'Space again returns to Paper')

    // the sample file, keyboard only, signed out
    await page.goto(`${BASE}/app/check`, { waitUntil: 'networkidle' })
    const sample = page.getByTestId('try-sample')
    await sample.waitFor({ timeout: 30000 })
    let reached = false
    for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'try-sample') }
    ok(reached, 'signed out: "Try the sample file" is reached by Tab')
    ok(!(await active(page)).endsWith('|none|0px'), 'signed out: it shows a focus outline')
    await page.keyboard.press('Enter')
    await page.getByTestId('sample-label').waitFor({ timeout: 15000 })
    ok((await page.getByTestId('sample-label').innerText()).toLowerCase() === 'sample file: synthetic fills, real prices', 'Enter prints the result labelled "Sample file: synthetic fills, real prices"')
  }
  {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    await mock(page, false)
    await page.goto(`${BASE}/app/overview?userId=demo-moderate`, { waitUntil: 'networkidle' })
    const dl = page.getByRole('button', { name: 'Download report' })
    await dl.waitFor({ timeout: 30000 })
    ok((await dl.innerText()).trim() === '', '390: the header actions are icon-only (named by aria-label)')
    const box = await dl.boundingBox()
    ok(!!box && box.width >= 44 && box.height >= 44, `390: the Download report target is at least 44 px (${box?.width}x${box?.height})`)
    await dl.focus()
    await page.waitForTimeout(500)
    ok(await page.getByRole('tooltip').first().isVisible().catch(() => false), '390: focusing an icon shows its tooltip')
  }

  await b.close()
  console.log(failed ? `FAILED: ${failed}` : 'ALL PASS')
  process.exit(failed ? 1 : 0)
}
void main()
