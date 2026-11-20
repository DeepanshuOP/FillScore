/**
 * The rule that chose the landing hero's order (stated on the page in "Figures and sources"): among the demo-moderate
 * MARKET orders with a measured execution cost, the one whose cost is nearest the median of those costs; ties go to the
 * earliest order. The median of an even count is the lower middle value, so it is always one order's own value.
 * The landing fixture (app/lib/landing/fixtures/landing-order.*) was cut for the order this rule picks; a test checks it.
 */
export interface Candidate { orderId: string; createdAt: string; type: string; executionBps: number | null }

export const HERO_RULE = 'The demo-moderate market order whose execution cost is nearest that account’s median market-order execution cost (the lower middle value of an even count); a tie goes to the earliest order.'

export function lowerMedian(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}

export function chooseHeroOrder(orders: Candidate[]): (Candidate & { executionBps: number }) | null {
  const rows = orders.filter((o): o is Candidate & { executionBps: number } =>
    o.type === 'MARKET' && typeof o.executionBps === 'number' && Number.isFinite(o.executionBps))
  if (!rows.length) return null
  const m = lowerMedian(rows.map((r) => r.executionBps))
  return [...rows].sort((a, b) => Math.abs(a.executionBps - m) - Math.abs(b.executionBps - m) || a.createdAt.localeCompare(b.createdAt))[0]
}
