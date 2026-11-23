import { Download } from 'lucide-react'
import { loadAccount } from '../../lib/data'
import { count, money, qty, share, tableTime } from '../../lib/format'
import { pageValues } from '../../lib/view'
import { Tile } from '../../components/Blocks'
import { PageHeader, PeriodPicker } from '../../components/PageHeader'

/**
 * Fills (PROPOSAL §5 and §4 rows 1-2): one page, no Patterns tab and no not-computed sentence; the columns are the fill's own
 * stored values. "Price vs public trades" is the proposed server-side measure and is not shown until the server serves it.
 */
export default async function V5Fills({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const a = loadAccount((await searchParams).userId)
  const v = pageValues(a)
  const rows = a.trades.slice(0, 50)
  return (
    <main id="main">
      <PageHeader title="Fills" description={`Each execution with its price, size and fee. ${count(a.current.fills, 'fill')} on Binance Spot.`}
        controls={<PeriodPicker period={v.period} />}
        primary={<button type="button" className="v-btn"><Download size={16} aria-hidden="true" />Export CSV</button>} />
      <div className="flex flex-col gap-4 px-4 pb-10 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Fills" value={a.current.fills.toLocaleString('en-US')} sub={`in ${count(a.current.orders, 'order')}`} />
          <Tile label="Maker share" value={share(a.current.makerRatio)} sub="of fills added liquidity" />
          <Tile label="Notional" value={money(a.current.notionalUsd)} sub="of all fills" />
          <Tile label="Fees" value={money(a.ordersBody.shortfall.totals.fees.usd)} sub={v.headline?.feesNotMeasured ? 'published rate, not independently measured' : undefined} />
        </div>
        <div data-testid="fills-tabs" className="flex flex-wrap items-center gap-2">
          <span className="v-btn">Symbol: All</span><span className="v-btn">Side: All</span>
          <p className="ml-auto text-[13px] text-[var(--v-text-2)]">Newest 50 of {count(a.current.fills, 'fill')}</p>
        </div>
        {/* PROPOSAL §4 row 1, class (a): the column goes, one sentence stays where the reader looks */}
        <p className="text-[14px] text-[var(--v-text-2)]">Per-fill scores are not shown: this demo data has no rule-based per-fill fields, and none was invented.</p>
        <div className="hidden overflow-x-auto rounded-[10px] border border-[var(--v-border)] bg-[var(--v-surface)] md:block">
          <table className="v-table">
            <thead><tr><th>Time (UTC)</th><th>Symbol</th><th>Side</th><th className="num">Price</th><th className="num">Size</th><th className="num">Notional</th><th className="num">{v.headline?.feesNotMeasured ? 'Fee (published rate)' : 'Fee'}</th><th>Liquidity</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.tradeId}>
                  <td>{tableTime(t.executedAt)}</td><td className="font-medium">{t.symbol}</td><td>{t.side === 'BUY' ? 'Buy' : 'Sell'}</td>
                  <td className="num">{t.executionPrice.toLocaleString('en-US')}</td><td className="num">{qty(t.quantity)}</td>
                  <td className="num">{money(t.notional)}</td><td className="num">{money(t.feeUsd) ?? 'not computed'}</td><td>{t.isMaker ? 'Maker' : 'Taker'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="flex flex-col gap-2 md:hidden">
          {rows.map((t) => (
            <li key={t.tradeId} className="v-card flex items-start justify-between gap-3 p-3">
              <span className="min-w-0"><span className="block text-[15px] font-semibold">{t.symbol} · {t.side === 'BUY' ? 'Buy' : 'Sell'}</span><span className="block text-[13px] text-[var(--v-text-2)]">{tableTime(t.executedAt)} UTC · {t.isMaker ? 'Maker' : 'Taker'}</span></span>
              <span className="shrink-0 text-right"><span className="block text-[15px] font-semibold">{money(t.notional)} <span className="text-[13px] font-normal text-[var(--v-text-2)]">notional</span></span><span className="block text-[13px] text-[var(--v-text-2)]">{qty(t.quantity)} @ {t.executionPrice.toLocaleString('en-US')} · fee {money(t.feeUsd) ?? 'not computed'}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
