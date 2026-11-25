'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiBase } from '../../lib/apiBase'
import { ValueState } from '../../ui/ValueState'
import { buttonClass } from '../../ui/buttonClass'
import { describeHeadline, totalBpsLabel, type Headline } from '../../dashboard/headline'
import { orderCountsOf, type OrderCounts } from '../../dashboard/ordersTable'
import { DEMO_PROFILES } from '../../utils/demoProfiles'
import { monthLabel } from '../../utils/periodLabel'
import { money } from '../../lib/format'

type Card = { counts: OrderCounts | null; headline: Headline | null; period: string | null }

/**
 * The demo entry (/demo, design v5): the three synthetic traders as three cards. A card carries the trader's name and one-line
 * description, the total cost (dollars and basis points of the value ordered), the orders, the period, the synthetic line and an Open
 * button that leads to that trader's audit. Every figure is read from the API (the server's values); one that did not load reads
 * "not computed", never zero. The synthetic line is on every card (invariant I5).
 */
export function DemoChoice() {
  const [data, setData] = useState<Record<string, Card | 'error'>>({})
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

  return (
    <ul className="grid gap-4 md:grid-cols-3" data-testid="demo-choice">
      {DEMO_PROFILES.map((d) => {
        const v = data[d.id]
        const loaded = v && v !== 'error' ? v : null
        const total = loaded?.headline ? money(loaded.headline.totalUsd) : null
        const rows: Array<[string, string | null]> = loaded
          ? [['Orders', loaded.counts ? loaded.counts.orders.toLocaleString('en-US') : null], ['Period', loaded.period]]
          : []
        return (
          <li key={d.id}>
            <article className="flex h-full flex-col gap-4 rounded-xl border border-ui-rule bg-ui-raised p-5 shadow-ui">
              <div>
                <h2 className="text-[20px] font-semibold leading-tight text-ui-ink">{d.archetype}</h2>
                <p className="mt-1 text-[14px] leading-snug text-ui-graphite">{d.tagline}</p>
              </div>
              {v === 'error' ? <ValueState state="not-computed" label="This trader's figures" reason="The demo audit could not be loaded." size="cell" />
                : loaded ? (
                  <>
                    <div>
                      <p className="text-[13px] font-medium text-ui-graphite">Total cost</p>
                      <p className="kpi-figure text-[28px] text-ui-ink">{total ?? 'not computed'}</p>
                      <p className="text-[14px] text-ui-graphite" data-testid="demo-total-bps">{loaded.headline ? `${totalBpsLabel(loaded.headline)} of the value ordered` : 'not computed'}</p>
                    </div>
                    <dl className="flex flex-col">
                      {rows.map(([k, val]) => (
                        <div key={k} className="flex items-baseline justify-between gap-4 border-t border-ui-rule py-2 text-[14px]">
                          <dt className="text-ui-graphite">{k}</dt>
                          <dd className="text-right text-ui-ink">{val ?? 'not computed'}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : <p className="text-[14px] text-ui-graphite" role="status">Loading the figures.</p>}
              <p className="mt-auto text-[13px] text-ui-graphite">Synthetic trader, real Binance prices. Read-only.</p>
              <Link href={`/app?userId=${d.id}`} className={buttonClass('primary', 'md', 'w-full no-underline pointer-coarse:h-11')} data-testid={`demo-slip-${d.id}`}>Open</Link>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
