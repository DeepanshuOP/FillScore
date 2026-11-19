// First Load JS per route, from a finished `next build` (Next 16 no longer prints the table).
//   node scripts/first-load-js.mjs            # prints a markdown table (gzip kB), reads .next only
//
// Method (stated so the number can be checked): for each app route, the client chunks the browser must fetch on a
// first visit = the framework's root files (build-manifest rootMainFiles + polyfillFiles) united with every chunk named
// in the route's page_client-reference-manifest (clientModules chunks and entryJSFiles), which covers the page and its
// layouts. Chunks behind a dynamic import are not in the manifest of the route and are not counted: they load later.
// Each distinct chunk is gzipped once (zlib level 9) and summed. This is an estimate of what Next 15 used to print; the
// same script runs before and after a change, so the difference is what matters.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import vm from 'node:vm'

const next = join(process.cwd(), '.next')
const build = JSON.parse(readFileSync(join(next, 'build-manifest.json'), 'utf8'))
const root = [...(build.rootMainFiles ?? []), ...(build.polyfillFiles ?? [])]
const gz = new Map()
const size = (f) => {
  const rel = f.replace(/^\/?_next\//, '').replace(/^\//, '')
  if (!gz.has(rel)) gz.set(rel, gzipSync(readFileSync(join(next, rel)), { level: 9 }).length)
  return gz.get(rel)
}

function pages(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (!statSync(p).isDirectory()) continue
    const manifest = join(p, 'page_client-reference-manifest.js')
    try { statSync(manifest); out.push([`${base}/${name}`.replace(/\/page$/, ''), manifest]) } catch { /* not a page */ }
    out.push(...pages(p, `${base}/${name}`))
  }
  return out
}

const rows = []
const appDir = join(next, 'server', 'app')
const entries = [['/', join(appDir, 'page_client-reference-manifest.js')], ...pages(appDir)]
for (const [route, file] of entries) {
  let src
  try { src = readFileSync(file, 'utf8') } catch { continue }
  const ctx = { globalThis: {} }
  ctx.globalThis = ctx
  vm.runInNewContext(src, ctx)
  const m = Object.values(ctx.__RSC_MANIFEST)[0]
  const chunks = new Set(root)
  for (const mod of Object.values(m.clientModules ?? {})) for (const c of mod.chunks ?? []) if (typeof c === 'string' && c.endsWith('.js')) chunks.add(c.replace(/^\/_next\//, ''))
  for (const files of Object.values(m.entryJSFiles ?? {})) for (const c of files) if (c.endsWith('.js')) chunks.add(c)
  let total = 0
  for (const c of chunks) { try { total += size(c) } catch { /* missing */ } }
  rows.push([route === '' ? '/' : route, total])
}
rows.sort((a, b) => a[0].localeCompare(b[0]))
console.log('| route | first load JS (gzip kB) |\n|---|---|')
for (const [r, t] of rows) console.log(`| ${r} | ${(t / 1024).toFixed(1)} |`)
