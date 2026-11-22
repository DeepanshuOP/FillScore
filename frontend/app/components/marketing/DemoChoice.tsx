'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiBase } from '../../lib/apiBase'
import { ValueState } from '../../ui/ValueState'
import { describeHeadline, totalBpsLabel, type Headline } from '../../dashboard/headline'
import { orderCountsOf, type OrderCounts } from '../../dashboard/ordersTable'
import { DEMO_PROFILES } from '../../utils/demoProfiles'
import { monthLabel } from '../../utils/periodLabel'

type Slip = { counts: OrderCounts | null; headline: Headline | null; period: string | null }

/**
 * The demo entry (/demo): the three synthetic traders as printed slips, each one a link to its audit. A slip carries the trader's
 * name and one-line description, the orders, the fills, the period and the total cost in basis points, all read from the API (the
 * server's figures), and the synthetic line. A figure that did not load is shown as not computed, never as zero.
 */
export function DemoChoice() {
  const [data, setData] = useState<Record<string, Slip | 'error'>>({})
  useEffect(() => {
    let live = true
    for (const d of DEMO_PROFILES) {
      const q = `?userId=${d.id}`
      Promise.all([
        fetch(`${apiBase()}/audit/score${q}`).then(async (r) => (r.ok ? r.json() : null)),
        fetch(`${apiBase()}/audit/orders-summary${q}`).then(async (r) => (r.ok ? r.json() : null)),
      ]).then(([score, orders]) => {
        const p = (score as { period?: { start: string; end: string } } | null)?.period
        if (live) setData((s) => ({ ...s, [d.id]: { counts: orderCountsOf(orders), headline: describeHeadline(orders, true), period: p ? monthLabel(p.start, p.end) : null } }))
      }).catch(() => { if (live) setData((s) => ({ ...s, [d.id]: 'error' })) })
    }
    return () => { live = false }
  }, [])

  const int = new Intl.NumberFormat('en-US')
  return (
    <ul className="grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-12" data-testid="demo-choice">
      {DEMO_PROFILES.map((d) => {
        const v = data[d.id]
        const rows: Array<[string, string | null]> = v && v !== 'error'
          ? [['Orders', v.counts ? int.format(v.counts.orders) : null], ['Fills', v.counts ? int.format(v.counts.fills) : null], ['Period', v.period],
            ['Total cost', v.headline ? `${totalBpsLabel(v.headline)} of the value ordered` : null]]
          : []
        return (
          <li key={d.id} className="relative">
            <Link href={`/app?userId=${d.id}`} className="group block no-underline" data-testid={`demo-slip-${d.id}`}>
              <div className="fs-receipt shadow-ui transition-transform duration-200 ease-out group-hover:-translate-y-1">
                <p className="fs-r-title !text-[1.375rem]">{d.archetype}</p>
                <p className="c g mt-1">SYNTHETIC TRADER, REAL PRICES</p>
                <hr />
                <p className="text-[15px] leading-snug text-ui-ink">{d.tagline}</p>
                {v === 'error' ? <div className="mt-3"><ValueState state="not-computed" label="This trader's figures" reason="The demo audit could not be loaded." size="cell" /></div>
                  : v ? (
                    <dl className="mt-3 flex flex-col">
                      {rows.map(([k, val]) => (
                        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-ui-rule py-1.5">
                          <dt className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite uppercase">{k}</dt>
                          <dd className="text-right font-mono text-[13px] text-ui-ink" data-testid={k === 'Total cost' ? 'demo-total-bps' : undefined}>{val ?? 'not computed'}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : <p className="g mt-3">PRINTING</p>}
                <div className="fs-perf mt-3" aria-hidden="true" />
                <p className="text-center font-mono text-[12px] tracking-[0.06em] text-ui-ink uppercase">Open this audit</p>
              </div>
              <div aria-hidden="true" className="fs-torn-bottom" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
