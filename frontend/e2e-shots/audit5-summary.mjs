/**
 * Design v5 audit (step 1): reads every report-*.json that audit5.ts wrote in <dir> and prints, per page, one markdown row per
 * viewport and theme, then totals. Pure reading; prints to stdout.
 *   node e2e-shots/audit5-summary.mjs <dir> [--totals]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// A later report replaces an earlier row of the same page, viewport and theme (a page measured again after a fixture fix).
const dir = resolve(process.argv[2] ?? '../.work/audit5')
const files = readdirSync(dir).filter((f) => /^report-.*\.json$/.test(f)).sort((a, b) => statSync(join(dir, a)).mtimeMs - statSync(join(dir, b)).mtimeMs)
const latest = new Map()
for (const f of files) for (const r of JSON.parse(readFileSync(join(dir, f), 'utf8'))) latest.set(`${r.page}|${r.viewport}|${r.theme}`, r)
const rows = [...latest.values()]
const order = ['desktop-1440', 'desktop-1280', 'tablet-768', 'iphone-15', 'pixel-8']
rows.sort((a, b) => a.page.localeCompare(b.page) || order.indexOf(a.viewport) - order.indexOf(b.viewport) || a.theme.localeCompare(b.theme))

const mdAt = process.argv.indexOf('--md')
if (mdAt > 0) {
  // --md <file>: one table per page (light and dark in one cell, "light / dark"), written between the markers
  // <!-- pages:start --> and <!-- pages:end --> of <file>.
  const target = resolve(process.argv[mdAt + 1])
  const v = (r, k) => (r ? (r[k] ?? '') : '')
  const lines = []
  for (const page of [...new Set(rows.map((r) => r.page))]) {
    lines.push(`\n#### ${page}\n`, '| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |', '|---|---|---|---|---|---|---|---|')
    for (const vp of order) {
      const L = rows.find((r) => r.page === page && r.viewport === vp && r.theme === 'light')
      const D = rows.find((r) => r.page === page && r.viewport === vp && r.theme === 'dark')
      if (!L && !D) continue
      const both = (k) => `${v(L, k)} / ${v(D, k)}`
      const phone = vp === 'iphone-15' || vp === 'pixel-8'
      const eng = L?.engine && vp === 'iphone-15' && L.engine !== 'webkit' ? ` (${L.engine})` : ''
      lines.push(`| ${vp}${eng} | ${both('minFontPx')} | ${both('under12')} | ${v(L, 'capsRuns')} (${v(L, 'capsUnder12')}) / ${v(D, 'capsRuns')} (${v(D, 'capsUnder12')}) | ${both('contrastNodes')} | ${v(L, 'notComputed')}/${v(L, 'insufficient')}/${v(L, 'dashes')} | ${phone ? both('smallTargets') : ''} | ${[L?.image, D?.image].filter(Boolean).join(', ')} |`)
    }
  }
  const md = readFileSync(target, 'utf8')
  const a = md.indexOf('<!-- pages:start -->'), b = md.indexOf('<!-- pages:end -->')
  if (a < 0 || b < a) throw new Error('markers not found in ' + target)
  writeFileSync(target, md.slice(0, a + '<!-- pages:start -->'.length) + '\n' + lines.join('\n') + '\n' + md.slice(b))
  console.log(`wrote ${lines.length} lines into ${target}`)
} else if (process.argv.includes('--totals')) {
  const sum = (k, f = () => true) => rows.filter(f).reduce((s, r) => s + (r[k] ?? 0), 0)
  const phone = (r) => r.viewport === 'iphone-15' || r.viewport === 'pixel-8'
  console.log(JSON.stringify({
    states: rows.length, errors: rows.filter((r) => r.error).length,
    minFontPx: Math.min(...rows.filter((r) => r.minFontPx).map((r) => r.minFontPx)),
    under12: sum('under12'), capsRuns: sum('capsRuns'), capsUnder12: sum('capsUnder12'), contrastNodes: sum('contrastNodes'),
    notComputed: sum('notComputed'), insufficient: sum('insufficient'), dashes: sum('dashes'), smallTargetsPhone: sum('smallTargets', phone),
    pagesWithUnder12: new Set(rows.filter((r) => r.under12 > 0).map((r) => r.page)).size, pages: new Set(rows.map((r) => r.page)).size,
  }))
} else {
  let page = ''
  for (const r of rows) {
    if (r.page !== page) {
      page = r.page
      console.log(`\n### ${page}\n\n| Viewport | Theme | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Image |\n|---|---|---|---|---|---|---|---|---|`)
    }
    if (r.error) { console.log(`| ${r.viewport} | ${r.theme} | error: ${r.error.slice(0, 60)} | | | | | | |`); continue }
    console.log(`| ${r.viewport}${r.engine && r.engine !== (r.viewport === 'iphone-15' ? 'webkit' : 'chromium') ? ` (${r.engine})` : ''} | ${r.theme} | ${r.minFontPx} | ${r.under12} | ${r.capsRuns} (${r.capsUnder12}) | ${r.contrastNodes} | ${r.notComputed} / ${r.insufficient} / ${r.dashes} | ${r.viewport.startsWith('iphone') || r.viewport.startsWith('pixel') ? r.smallTargets : ''} | ${r.image ?? ''} |`)
  }
}
