/**
 * break-ui for IA v4 (sixth order, step 9): Home, Orders, Fills and Check with the demo's worst cases (long values, no orders, one
 * order) at 390, 320 and 720 px (about 200% zoom of a 1440 px window). It runs look.ts for each combination and prints the DOM
 * checks. Needs a production server on QA_BASE (default http://localhost:3101).   npx tsx e2e-shots/break4.ts
 */
import { execFileSync } from 'node:child_process'

const PAGES: Array<[string, string]> = [['home', '/app?userId=demo-moderate'], ['orders', '/app/orders?userId=demo-moderate'], ['fills', '/app/fills?userId=demo-moderate'], ['check', '/app/check']]
const CASES = ['normal', 'long', 'empty', 'one']
let bad = 0
for (const [name, path] of PAGES) {
  for (const c of CASES) {
    const args = ['tsx', 'e2e-shots/look.ts', `b4-${name}-${c}`, path, '390,320,720', ...(c === 'normal' ? [] : [`case=${c}`])]
    const out = execFileSync('npx', args, { encoding: 'utf8', timeout: 240000 })
    for (const line of out.split('\n').filter((l) => l.startsWith('{"width"'))) {
      const r = JSON.parse(line) as { width: number; overflow: number; wide: string[]; overlaps: string[]; axe: string[] }
      const problem = r.overflow > 0 || r.wide.length || r.overlaps.length || r.axe.length
      if (problem) bad++
      console.log(`${problem ? 'PROBLEM' : 'ok     '} ${name} ${c} ${r.width}px ${problem ? JSON.stringify({ overflow: r.overflow, wide: r.wide, overlaps: r.overlaps.slice(0, 3), axe: r.axe }) : ''}`)
    }
  }
}
console.log(bad ? `PROBLEMS: ${bad}` : 'ALL OK')
