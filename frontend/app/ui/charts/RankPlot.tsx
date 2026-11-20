'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatSignedBps } from '../format'
import type { RankPlotView } from '../../dashboard/rankingsView'

/**
 * Dot and interval per ranked group on one shared bps axis: the band is the 90% interval of the median, the dot the
 * median. The rank sits at the left; groups that share a rank share its number. Groups with too few orders follow in a
 * quiet list, with no mark at all (no median is drawn for them). The table form is RankTable.
 */
export function RankPlot({ view }: { view: RankPlotView }) {
  if (!view.domain) return null
  const [d0, d1] = view.domain
  const span = d1 - d0 || 1
  const pad = span * 0.08
  const pct = (v: number) => ((v - (d0 - pad)) / (span + 2 * pad)) * 100
  const zeroIn = d0 - pad < 0 && d1 + pad > 0
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[2.25rem_minmax(5.5rem,8rem)_1fr] items-center gap-x-3 pb-2 text-[11px] text-ui-graphite sm:grid-cols-[2.25rem_9rem_1fr_5rem]">
        <span>Rank</span><span>Group</span>
        <span className="flex justify-between tabular-nums"><span>{formatSignedBps(d0)}</span><span>{formatSignedBps(d1)}</span></span>
        <span className="hidden text-right sm:block">Orders</span>
      </div>
      <ul className="flex flex-col">
        {view.ranked.map((r, i) => {
          const sharesPrev = i > 0 && view.ranked[i - 1].rank === r.rank
          return (
            <li key={r.key} className="grid grid-cols-[2.25rem_minmax(5.5rem,8rem)_1fr] items-center gap-x-3 border-t border-ui-rule py-2.5 sm:grid-cols-[2.25rem_9rem_1fr_5rem]">
              <span className={sharesPrev ? 'text-[13px] tabular-nums text-ui-graphite' : 'text-[15px] font-semibold tabular-nums text-ui-ink'}>{r.rank}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ui-ink">{r.key}</span>
                {r.tie ? <span className="block truncate text-[11px] text-ui-graphite" title={r.tie}>{r.tie}</span> : null}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span role="img" className="relative block h-7 cursor-default" aria-label={`${r.key}: median ${formatSignedBps(r.median)}, ${Math.round(view.level * 100)}% interval ${formatSignedBps(r.low)} to ${formatSignedBps(r.high)}, rank ${r.rank}`}>
                    {zeroIn ? <span aria-hidden="true" className="absolute inset-y-0 w-px bg-ui-edge/60" style={{ left: `${pct(0)}%` }} /> : null}
                    <span aria-hidden="true" className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[color-mix(in_srgb,var(--ui-measured)_28%,transparent)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--ui-measured)_50%,transparent)]"
                      style={{ left: `${pct(r.low)}%`, width: `max(4px, ${pct(r.high) - pct(r.low)}%)` }} />
                    <span aria-hidden="true" className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ui-measured ring-2 ring-ui-raised" style={{ left: `${pct(r.median)}%` }} />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="tabular-nums">
                  {r.key}: median {formatSignedBps(r.median)}, {Math.round(view.level * 100)}% interval {formatSignedBps(r.low)} to {formatSignedBps(r.high)}, {r.n} orders
                </TooltipContent>
              </Tooltip>
              <span className="hidden text-right text-[13px] tabular-nums text-ui-graphite sm:block">{r.n}</span>
            </li>
          )
        })}
      </ul>
      {view.tooFew.length ? (
        <div className="mt-4 border-t border-dashed border-ui-rule pt-3">
          <p className="mb-1.5 text-[13px] font-medium text-ui-ink">Too few to tell</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {view.tooFew.map((g) => (
              <li key={g.key} className="text-[13px] text-ui-graphite"><span className="text-ui-ink">{g.key}</span>, {g.n} orders ({view.minOrders} needed)</li>
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
    <table className="w-full text-[13px]">
      <caption className="sr-only">Rankings</caption>
      <thead className="text-left text-ui-graphite">
        <tr><th scope="col" className="py-2 font-medium">Rank</th><th scope="col" className="font-medium">Group</th><th scope="col" className="text-right font-medium">Median</th><th scope="col" className="text-right font-medium">{pctLevel}% interval</th><th scope="col" className="text-right font-medium">Orders</th><th scope="col" className="hidden pl-4 font-medium md:table-cell">Note</th></tr>
      </thead>
      <tbody className="tabular-nums">
        {view.ranked.map((r) => (
          <tr key={r.key} className="border-t border-ui-rule">
            <td className="py-2 text-ui-ink">{r.rank}</td><td className="text-ui-ink">{r.key}</td>
            <td className="text-right text-ui-ink">{formatSignedBps(r.median)}</td>
            <td className="text-right text-ui-graphite">{formatSignedBps(r.low)} to {formatSignedBps(r.high)}</td>
            <td className="text-right text-ui-graphite">{r.n}</td>
            <td className="hidden pl-4 text-ui-graphite md:table-cell">{r.tie ?? ''}</td>
          </tr>
        ))}
        {view.tooFew.map((g) => (
          <tr key={g.key} className="border-t border-ui-rule">
            <td className="py-2 text-ui-graphite">none</td><td className="text-ui-ink">{g.key}</td>
            <td colSpan={2} className="text-right text-ui-graphite">too few to tell</td>
            <td className="text-right text-ui-graphite">{g.n}</td><td className="hidden pl-4 text-ui-graphite md:table-cell">{view.minOrders} orders are needed</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
