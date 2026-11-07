/** Dashboard COMPONENT SCORES cards. Every score is the engine's notional-weighted component mean from the API
 *  (`breakdown.componentMeans`); nothing is re-derived in the browser. */
export interface ComponentMeans { slippage: number | null; fees: number | null; timing: number | null; spread: number | null }

export interface CardInput {
  avgSlippageBps: number
  makerRatio: number
  bestHour: number
  componentMeans?: ComponentMeans | null
}

export interface ComponentCard { label: string; key: string; score: string; weight: string; value: string; description: string; tooltip?: string }

/** What the card draws. A "—" (null) component has no bar and no colour score, so it can never look like a worst case. */
export function cardVisual(card: ComponentCard): { hasBar: boolean; barPct: number; colorScore: number | null } {
  if (card.score === '—') return { hasBar: false, barPct: 0, colorScore: null }
  const n = Number(card.score)
  return { hasBar: true, barPct: n, colorScore: n }
}

export const NO_SCORES_TOOLTIP = 'Re-run audit to see component scores'

const show = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : String(Math.round(n)))

export function buildComponentCards(b: CardInput): ComponentCard[] {
  const m = b.componentMeans ?? null
  const tip = (v: number | null | undefined) => (m == null || v == null ? NO_SCORES_TOOLTIP : undefined)
  return [
    { label: 'SLIPPAGE', key: 'slippage', score: show(m?.slippage), weight: '35%',
      value: `${b.avgSlippageBps.toFixed(1)} bps avg`, description: 'Arrival price vs execution', tooltip: tip(m?.slippage) },
    { label: 'LIQUIDITY PROVISION', key: 'fees', score: show(m?.fees), weight: '25%',
      value: `${Math.round(b.makerRatio * 100)}% maker`, description: 'Maker vs taker order ratio', tooltip: tip(m?.fees) },
    { label: 'TIMING', key: 'timing', score: show(m?.timing), weight: '25%',
      value: `Best hour: ${b.bestHour}:00 UTC`, description: 'UTC session (rule-based)', tooltip: tip(m?.timing) },
    { label: 'SPREAD', key: 'exchange', score: show(m?.spread), weight: '15%',
      value: m?.spread == null ? '—' : 'Estimated spread score', description: 'Estimated spread at execution', tooltip: tip(m?.spread) },
  ]
}
