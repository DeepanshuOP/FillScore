'use client'

import { formatSignedBps } from '../format'
import { PenBracket } from '../PenMarks'
import type { RankPlotView } from '../../dashboard/rankingsView'

/**
 * Rankings as a tape (design v3). One printed row per ranked group, rank 1 first, on one shared bps ruler: the pen
 * brackets the 90% interval of the median and an ink dot marks the median; the interval is also printed in words.
 * Groups whose intervals overlap share a rank and read "not distinguishable from ...". Groups with too few orders follow
 * as "too few to tell" and get no mark at all. The table form is RankTable.
 */
export function RankPlot({ view }: { view: RankPlotView }) {
  if (!view.domain) return null
  const [d0, d1] = view.domain
  const span = d1 - d0 || 1
  const pad = span * 0.08
  const at = (v: number) => (v - (d0 - pad)) / (span + 2 * pad)
  const zeroIn = d0 - pad < 0 && d1 + pad > 0
  const level = Math.round(view.level * 100)
  return (
    <div className="flex flex-col">
      <div className="fs-strip fs-sprockets px-4 pt-6 pb-5 sm:px-6">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-end gap-x-4 pb-2 font-mono text-[11px] text-ui-graphite sm:grid-cols-[3rem_10rem_minmax(0,1fr)_4.5rem]">
          <span>RANK</span><span className="max-sm:hidden">GROUP</span>
          <span className="relative flex justify-between max-sm:col-start-2">
            <span>{formatSignedBps(d0)}</span>
            {zeroIn && at(0) > 0.15 && at(0) < 0.85 ? <span className="absolute -translate-x-1/2" style={{ left: `${at(0) * 100}%` }}>0</span> : null}
            <span>{formatSignedBps(d1)}</span>
          </span>
          <span className="text-right max-sm:hidden">ORDERS</span>
        </div>
        <ol className="border-t border-ui-ink">
          {view.ranked.map((r, i) => {
            const sharesPrev = i > 0 && view.ranked[i - 1].rank === r.rank
            return (
              <li key={r.key} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-dashed border-ui-rule py-3 sm:grid-cols-[3rem_10rem_minmax(0,1fr)_4.5rem]">
                <span className={sharesPrev ? 'row-span-2 text-2xl font-black tracking-[-0.04em] text-ui-graphite sm:row-span-1' : 'row-span-2 text-2xl font-black tracking-[-0.04em] text-ui-ink sm:row-span-1'}>{r.rank}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-ui-ink">{r.key}</span>
                  {r.tie ? <span className="block text-[12px] leading-4 text-ui-graphite">{r.tie}</span> : null}
                </span>
                <span role="img" className="relative block max-sm:col-start-2"
                  aria-label={`${r.key}: median ${formatSignedBps(r.median)}, ${level}% interval ${formatSignedBps(r.low)} to ${formatSignedBps(r.high)}, rank ${r.rank}, ${r.n} orders`}>
                  <span aria-hidden="true" className="relative block h-5">
                    {zeroIn ? <span className="absolute inset-y-0 w-px bg-ui-edge" style={{ left: `${at(0) * 100}%` }} /> : null}
                    <span className="absolute inset-x-0 top-[6px] h-px bg-ui-rule" />
                    <span className="absolute inset-0"><PenBracket from={at(r.low)} to={at(r.high)} seed={i + 11} /></span>
                    <span className="absolute top-[6px] size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ui-ink" style={{ left: `${at(r.median) * 100}%` }} />
                  </span>
                  <span aria-hidden="true" className="mt-0.5 block font-mono text-[11px] text-ui-pen-ink">median {formatSignedBps(r.median)}, {level}% {formatSignedBps(r.low)} to {formatSignedBps(r.high)}</span>
                </span>
                <span className="text-right font-mono text-[13px] text-ui-graphite max-sm:hidden">{r.n}</span>
              </li>
            )
          })}
        </ol>
      </div>
      {view.tooFew.length ? (
        <div className="mt-5">
          <p className="font-mono text-[12px] tracking-[0.04em] text-ui-graphite uppercase">Too few to tell, fewer than {view.minOrders} orders</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1">
            {view.tooFew.map((g) => (
              <li key={g.key} className="text-sm text-ui-graphite"><span className="font-bold text-ui-ink">{g.key}</span>: too few to tell, {g.n} orders</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** The same rankings as a table (the chart is never the only form). */
export function RankTable({ view }: { view: RankPlotView }) {
  const pctLevel = Math.round(view.level * 100)
  return (
    <table className="w-full font-mono text-[13px]">
      <caption className="sr-only">Rankings</caption>
      <thead className="text-left text-[11px] text-ui-graphite">
        <tr className="border-b border-ui-ink"><th scope="col" className="py-2 font-normal">RANK</th><th scope="col" className="font-normal">GROUP</th><th scope="col" className="text-right font-normal">MEDIAN</th><th scope="col" className="text-right font-normal">{pctLevel}% INTERVAL</th><th scope="col" className="text-right font-normal">ORDERS</th><th scope="col" className="hidden pl-4 font-normal md:table-cell">NOTE</th></tr>
      </thead>
      <tbody className="tabular-nums">
        {view.ranked.map((r) => (
          <tr key={r.key} className="border-t border-dashed border-ui-rule">
            <td className="py-2 text-ui-ink">{r.rank}</td><td className="text-ui-ink">{r.key}</td>
            <td className="text-right text-ui-ink">{formatSignedBps(r.median)}</td>
            <td className="text-right text-ui-graphite">{formatSignedBps(r.low)} to {formatSignedBps(r.high)}</td>
            <td className="text-right text-ui-graphite">{r.n}</td>
            <td className="hidden pl-4 text-ui-graphite md:table-cell">{r.tie ?? ''}</td>
          </tr>
        ))}
        {view.tooFew.map((g) => (
          <tr key={g.key} className="border-t border-dashed border-ui-rule">
            <td className="py-2 text-ui-graphite">none</td><td className="text-ui-ink">{g.key}</td>
            <td colSpan={2} className="text-right text-ui-graphite">too few to tell</td>
            <td className="text-right text-ui-graphite">{g.n}</td><td className="hidden pl-4 text-ui-graphite md:table-cell">{view.minOrders} orders are needed</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
