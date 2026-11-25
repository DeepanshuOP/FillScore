import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_GROUP_N, RANK_LEVEL as BACKEND_LEVEL } from '../../../backend/src/services/rankWithNoise'
import { RANK_LEVEL, RANK_LEVEL_PERCENT, RANK_MIN_ORDERS } from './rankConstants'

// Reviewer item (design v5 step 5): the copy that says "90%" and "20 orders" reads the code constants, not a literal that could drift.
describe('rank constants', () => {
  it('are the backend constants the rankings route serves', () => {
    expect(RANK_LEVEL).toBe(BACKEND_LEVEL)
    expect(RANK_MIN_ORDERS).toBe(MIN_GROUP_N)
    expect(RANK_LEVEL_PERCENT).toBe('90%')           // hand value: Math.round(0.9 * 100) = 90
  })

  it('the rankings route serves the constants, not literals', () => {
    const src = readFileSync(join(__dirname, '../../../backend/src/routes/explain.ts'), 'utf8')
    expect(src).toContain('level: RANK_LEVEL, minOrders: MIN_GROUP_N')
    expect(src).not.toMatch(/level: 0\.9|minOrders: 20/)
  })

  it('the comparison copy states no literal "90%" or "20 orders"', () => {
    for (const file of ['dashboard/RankingsView.tsx', 'dashboard/DashboardContent.tsx']) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8')
      const strings = [...src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1|>([^<>{}\n]+)</g)].map((m) => m[2] ?? m[3] ?? '')
      const literal = strings.filter((s) => /\b90%|\b20 (measured )?orders|at least 20\b/.test(s))
      expect(literal, file).toEqual([])
    }
  })
})
