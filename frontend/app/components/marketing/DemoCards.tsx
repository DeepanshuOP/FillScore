'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { apiBase } from '../../lib/apiBase'
import { GradeChip } from '../../ui/GradeChip'
import { ValueState } from '../../ui/ValueState'
import { formatScore, formatUsd } from '../../ui/format'
import { StackBar, type StackPart } from '../../ui/charts/StackBar'
import { describeHeadline, gradeView, type GradeView, type Headline } from '../../dashboard/headline'

const DEMOS = [
  { id: 'demo-disciplined', name: 'The Disciplined Trader' },
  { id: 'demo-moderate', name: 'The Moderate Trader' },
  { id: 'demo-aggressive', name: 'The Aggressive Trader' },
] as const

type Loaded = { grade: GradeView | null; headline: Headline | null; parts: StackPart[] } | 'error' | null

/** Three demo accounts with their measured grade, total cost and the cost split, read live from the API. */
export function DemoCards() {
  const [data, setData] = useState<Record<string, Loaded>>({})
  useEffect(() => {
    let live = true
    for (const d of DEMOS) {
      const q = `?userId=${d.id}`
      Promise.all([
        fetch(`${apiBase()}/audit/v2${q}`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
        fetch(`${apiBase()}/audit/orders-summary${q}`).then(async (r) => (r.ok ? r.json() : null)),
      ]).then(([v2, orders]) => {
        const t = (orders as { shortfall?: { totals?: Record<string, { usd: number } | null> } } | null)?.shortfall?.totals
        const parts: StackPart[] = []
        if (t?.execution) parts.push({ key: 'execution', label: 'Execution cost', value: t.execution.usd, valueLabel: formatUsd(t.execution.usd) })
        if (t?.opportunity) parts.push({ key: 'opportunity', label: 'Unfilled orders', value: t.opportunity.usd, valueLabel: formatUsd(t.opportunity.usd) })
        if (t?.fees) parts.push({ key: 'fees', label: 'Fees at the published rate', value: t.fees.usd, valueLabel: formatUsd(t.fees.usd), stated: true, note: 'not independently measured' })
        if (live) setData((s) => ({ ...s, [d.id]: { grade: gradeView(v2.status, v2.body), headline: describeHeadline(orders, true), parts } }))
      }).catch(() => { if (live) setData((s) => ({ ...s, [d.id]: 'error' })) })
    }
    return () => { live = false }
  }, [])

  return (
    <section aria-labelledby="demos-title" className="mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-32">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h2 id="demos-title" data-split className="display-lg text-ui-ink">Open a finished audit.</h2>
          <p className="mt-4 text-[17px] leading-7 text-ui-graphite">Or explore with synthetic demo data: three traders who never existed, filled against real public prints of January 2024.</p>
        </div>
      </div>
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {DEMOS.map((d) => {
          const v = data[d.id]
          return (
            <li key={d.id}>
              <Link href={`/dashboard?userId=${d.id}`} className="group panel flex h-full flex-col gap-6 p-6 no-underline transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-ui-float">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">{d.name}</p>
                    <p className="mt-0.5 text-[12px] text-ui-graphite">Synthetic trader, real prices</p>
                  </div>
                  {v && v !== 'error' && v.grade?.kind === 'graded' ? <GradeChip grade={v.grade.letter} size="md" label={`Measured grade ${v.grade.letter}`} /> : <span className="size-10 rounded-[9px] bg-ui-overlay" aria-hidden="true" />}
                </div>
                <div className="min-h-[4.5rem]">
                  {v === 'error' ? <ValueState state="not-computed" label="Total cost" reason="The demo audit could not be loaded." size="cell" />
                    : v?.headline ? (
                      <>
                        <p className="text-[12px] text-ui-graphite">The {v.headline.orders} orders paid</p>
                        <p className="text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] tabular-nums text-ui-ink">{formatUsd(v.headline.totalUsd)}</p>
                        {v.grade?.kind === 'graded' ? <p className="text-[12px] tabular-nums text-ui-graphite">Measured score {formatScore(v.grade.score)} of 100</p> : null}
                      </>
                    ) : v ? <ValueState state="not-computed" label="Total cost" reason="The orders were not measured." size="cell" />
                      : <div className="h-[4.5rem] rounded-md bg-ui-overlay/50" aria-label="Loading" />}
                </div>
                <div className="mt-auto">
                  {v && v !== 'error' && v.parts.length ? <StackBar parts={v.parts} height={8} legend={false} /> : <div className="h-2 rounded-full bg-ui-overlay" />}
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] text-ui-graphite transition-colors group-hover:text-ui-ink">
                    Open the audit <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
