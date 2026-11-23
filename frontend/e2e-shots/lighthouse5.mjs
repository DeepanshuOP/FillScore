/**
 * Design v5 audit (step 1): Lighthouse mobile (its default emulation: Moto G Power, 4x CPU slowdown, slow 4G) on /, /demo, /app and
 * /app/orders, three runs each, the median of LCP, CLS and TBT reported. Lighthouse opens its own page, so the API answers come
 * from e2e-shots/mock-server.ts: build with BACKEND_PROXY_URL=http://127.0.0.1:3199, start the mock server on 3199 (and on 3001 for
 * server-side calls), then `PORT=3101 npm run start`.
 *   node e2e-shots/lighthouse5.mjs <out-dir> [base=http://localhost:3101] [prefix]
 * Needs Chrome: CHROME_PATH (default: Playwright's Chromium). Lighthouse is run with `npx -y lighthouse@12.8.2` (not a dependency).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const out = resolve(process.argv[2] ?? '../.work/lighthouse5')
const base = process.argv[3] ?? 'http://localhost:3101'
const prefix = process.argv[4] ?? ''
mkdirSync(out, { recursive: true })
const pw = join(homedir(), '.cache/ms-playwright')
const chromeDir = readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).sort().pop()
const chrome = process.env.CHROME_PATH ?? join(pw, chromeDir, 'chrome-linux64', 'chrome')
const ALL = [['landing', '/'], ['demo', '/demo'], ['app-home', '/app?userId=demo-moderate'], ['app-orders', '/app/orders?userId=demo-moderate']]
// LH_PAGES=name,name limits the pages (the design-lab prototype has no /demo page)
const PAGES = process.env.LH_PAGES ? ALL.filter(([n]) => process.env.LH_PAGES.split(',').includes(n)) : ALL
const RUNS = 3
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

const rows = []
for (const [name, path] of PAGES) {
  const runs = []
  for (let i = 1; i <= RUNS; i++) {
    const file = join(out, `${name}-${i}.json`)
    execFileSync('npx', ['-y', 'lighthouse@12.8.2', base + prefix + path, '--quiet', '--only-categories=performance', '--output=json', `--output-path=${file}`,
      '--chrome-flags=--headless=new --no-sandbox'],
      // On WSL chrome-launcher asks Windows for %LOCALAPPDATA% and creates its temporary profile at that path, which Linux reads as
      // a relative folder ("C:\Users\...\lighthouse.*", with a socket inside that breaks the next build). Run it from the OS temp
      // folder so those folders land there, never in the repo.
      { cwd: tmpdir(), env: { ...process.env, CHROME_PATH: chrome }, stdio: 'ignore', timeout: 180000 })
    const lhr = JSON.parse(readFileSync(file, 'utf8'))
    const a = lhr.audits
    runs.push({ score: Math.round((lhr.categories.performance.score ?? 0) * 100), lcpMs: Math.round(a['largest-contentful-paint'].numericValue),
      cls: Math.round(a['cumulative-layout-shift'].numericValue * 1000) / 1000, tbtMs: Math.round(a['total-blocking-time'].numericValue) })
  }
  const row = { page: name, path, runs, median: { score: median(runs.map((r) => r.score)), lcpMs: median(runs.map((r) => r.lcpMs)), cls: median(runs.map((r) => r.cls)), tbtMs: median(runs.map((r) => r.tbtMs)) } }
  rows.push(row)
  console.log(JSON.stringify({ page: name, ...row.median }))
}
writeFileSync(join(out, 'summary.json'), JSON.stringify(rows, null, 1))
