/**
 * Header cards of the dashboard. For a rebuilt demo the stored v1 audit describes the earlier (deleted) trades, so the
 * API sends `current`, computed from the account's present fills and orders; the cards copy it and say "fills" and
 * "orders" apart. Pure: no number is computed here from market data.
 */
export interface CurrentFigures { fills: number; orders: number; notionalUsd: number | null; makerRatio: number | null }
interface AuditFigures { totalTrades: number; totalNotional: number; breakdown: { makerRatio: number } }

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US');
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function describeHeaderStats(audit: AuditFigures, current: CurrentFigures | undefined | null) {
  if (current) {
    return {
      tradesLabel: 'FILLS ANALYSED', trades: int.format(current.fills),
      tradesSub: `in ${int.format(current.orders)} ${current.orders === 1 ? 'order' : 'orders'}`,
      volume: current.notionalUsd == null ? 'not computed' : usd.format(current.notionalUsd), volumeSub: 'notional of all fills',
      makerRatio: current.makerRatio == null ? 'not computed' : pct(current.makerRatio), makerSub: 'of fills',
    };
  }
  return {
    tradesLabel: 'TRADES ANALYSED', trades: int.format(audit.totalTrades), tradesSub: 'across all symbols',
    volume: usd.format(audit.totalNotional), volumeSub: 'notional traded',
    makerRatio: pct(audit.breakdown.makerRatio), makerSub: '',
  };
}

/** The card that links to the trades table. Rebuilt demos have no per-trade v1 scores, so the copy does not promise them. */
export function tradesCardCopy(v1Computed: boolean) {
  return v1Computed
    ? { title: 'See every trade in detail', subtitle: 'Sortable table · Per-trade scores · Full breakdown' }
    : { title: 'See every fill', subtitle: 'Sortable table · Price, size and fee of each fill · Per-trade scores not computed for this data' };
}
