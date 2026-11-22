/**
 * Home's recorded Ask (IA v4 step 3), against a production server on QA_BASE (default http://localhost:3101), answers from the mock:
 *   npx tsx e2e-shots/ask-print.ts
 * Checks: chip order (answers that passed first, a degraded one last); a passed answer carries the language-model heading, the
 * "Recorded answer, not live" label and the scope line; a degraded answer carries the one-line note and "Model calls: 2 · answer not
 * used", no LLM heading and no model name; the slip's paper and its first line start at the same instant (no blank slip beyond one
 * frame); under reduced motion nothing animates. Writes JPEGs to .work/look/.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { checks, mock } from './mock'

const BASE = process.env.QA_BASE ?? 'http://localhost:3101'
const OUT = resolve(__dirname, '../../.work/look')
mkdirSync(OUT, { recursive: true })
let failed = 0
const ok = (cond: boolean, what: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${what}`); if (!cond) failed++ }

async function main() {
  const b = await chromium.launch()
  for (const reduce of [false, true]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduce ? 'reduce' : 'no-preference' })
    const page = await ctx.newPage()
    await mock(page, false)
    await page.goto(`${BASE}/app?userId=demo-moderate`, { waitUntil: 'networkidle' })
    await page.getByTestId('ask-chip').first().waitFor()
    const chips = await page.getByTestId('ask-chip').allInnerTexts()
    const tag = reduce ? 'reduced' : 'motion'
    if (!reduce) ok(chips.length === 4 && chips[2] === 'Which orders cost the most?' && chips[3].startsWith('How did my market orders'), `chip order, passed first, degraded last: ${JSON.stringify(chips)}`)
    ok(await page.getByRole('textbox').count() === 0, `${tag}: no input box on a demo Home`)

    // a passed answer
    await page.getByTestId('ask-chip').first().click()
    const slip = page.getByTestId('ask-slip')
    await slip.waitFor()
    const txt1 = await slip.innerText()
    ok(txt1.includes('RECORDED ANSWER, NOT LIVE') && txt1.includes('JANUARY 2024, 245 ORDERS'), `${tag}: label and scope line on a passed answer`)
    ok(txt1.includes('Explanation (language model; every number was checked against the audit)'), `${tag}: the LLM heading over the model's text`)
    const anim = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="ask-slip"]')!
      const slipAnim = s.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, delay: a.effect!.getComputedTiming().delay }))
      const first = s.querySelector('.fa-line')!.getAnimations().map((a) => ({ name: (a as CSSAnimation).animationName, delay: a.effect!.getComputedTiming().delay }))
      return { slipAnim, first }
    })
    if (reduce) ok(anim.slipAnim.length === 0 && anim.first.length === 0, `reduced motion: the slip is finished at once (no animation)`)
    else ok(anim.slipAnim[0]?.name === 'fa-feed' && anim.slipAnim[0].delay === 0 && anim.first[0]?.name === 'fa-print' && anim.first[0].delay === 0, `paper and first line start together: ${JSON.stringify(anim)}`)
    await page.waitForTimeout(700)
    await page.screenshot({ path: resolve(OUT, `ask-passed-${tag}.jpg`), type: 'jpeg', quality: 60 })

    // the degraded answer (last chip: "How did my market orders compare ...")
    await page.getByTestId('ask-chip').last().click()
    await page.waitForTimeout(700)
    const txt2 = await page.getByTestId('ask-slip').innerText()
    ok(txt2.includes("The model's answer did not pass the checks, so code wrote this sentence from the measured values."), `${tag}: the one-line degraded note`)
    ok(txt2.includes('Model calls: 2 · answer not used'), `${tag}: meta line "Model calls: 2 · answer not used"`)
    ok(!txt2.includes('Explanation (language model') && !/groq|qwen|no model/i.test(txt2), `${tag}: no LLM heading, no model name, no "no model text" on a degraded answer`)
    ok(txt2.includes('Market orders cost -0.1 bps against a modelled 0.1 bps.'), `${tag}: the recorded code-built sentence, verbatim (no doubled unit)`)
    await page.screenshot({ path: resolve(OUT, `ask-degraded-${tag}.jpg`), type: 'jpeg', quality: 60 })
    console.log(JSON.stringify(await checks(page, `ask-${tag}`)))
    await ctx.close()
  }
  await b.close()
  console.log(failed ? `FAILED: ${failed}` : 'ALL PASS')
  process.exit(failed ? 1 : 0)
}
void main()
