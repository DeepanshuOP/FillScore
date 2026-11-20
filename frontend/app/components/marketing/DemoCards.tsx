'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiBase } from '../../lib/apiBase'
import { GradeStamp } from '../../ui/GradeStamp'
import { ValueState } from '../../ui/ValueState'
import { formatSignedBps, formatUsd } from '../../ui/format'
import { describeHeadline, gradeView, type GradeView, type Headline } from '../../dashboard/headline'

const DEMOS = [
  { id: 'demo-disciplined', name: 'The Disciplined Trader', tilt: '-rotate-[1.4deg]' },
  { id: 'demo-moderate', name: 'The Moderate Trader', tilt: 'rotate-[0.8deg] md:translate-y-6' },
  { id: 'demo-aggressive', name: 'The Aggressive Trader', tilt: '-rotate-[0.6deg]' },
] as const

type Loaded = { grade: GradeView | null; headline: Headline | null } | 'error' | null

/**
 * The three demo accounts as receipts pinned to the page (design v3): a strip of tape holds each one, with the grade
 * stamp, the period's total and a link to the audit. Read live from the API; synthetic traders, real prices.
 */
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
        if (live) setData((s) => ({ ...s, [d.id]: { grade: gradeView(v2.status, v2.body), headline: describeHeadline(orders, true) } }))
      }).catch(() => { if (live) setData((s) => ({ ...s, [d.id]: 'error' })) })
    }
    return () => { live = false }
  }, [])

  return (
    <section aria-labelledby="demos-title" className="px-[var(--ui-gutter)] py-24 lg:py-36">
      <div className="max-w-3xl">
        <h2 id="demos-title" data-split className="display-lg text-ui-ink">Open a finished audit.</h2>
        <p className="mt-4 text-[17px] leading-7 text-ui-graphite">Or explore with synthetic demo data: three traders who never existed, filled against the real public prints of January 2024.</p>
      </div>
      <ul className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8 lg:gap-14">
        {DEMOS.map((d) => {
          const v = data[d.id]
          return (
            <li key={d.id} className={`relative ${d.tilt}`}>
              {/* a strip of tape pins the receipt to the page */}
              <span aria-hidden="true" className="absolute -top-3 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rotate-[-3deg] bg-[color-mix(in_srgb,var(--ui-edge)_28%,transparent)]" />
              <Link href={`/dashboard?userId=${d.id}`} className="group block no-underline">
                <div className="fs-receipt shadow-ui transition-transform duration-200 ease-out group-hover:-translate-y-1">
                  <p className="fs-r-title !text-[1.375rem]">{d.name}</p>
                  <p className="c g mt-1">SYNTHETIC TRADER, REAL PRICES</p>
                  <hr />
                  <div className="flex min-h-[8.5rem] items-center justify-center py-2">
                    {v && v !== 'error' && v.grade?.kind === 'graded'
                      ? <GradeStamp grade={v.grade.letter} score={v.grade.score} period="January 2024" version={v.grade.scoringVersion} size="sm" />
                      : v && v !== 'error' && v.grade ? <ValueState state="insufficient" label="Measured grade" reason={v.grade.kind === 'none' ? v.grade.text : ''} size="cell" />
                        : <span className="g">{v === 'error' ? 'NOT LOADED' : 'PRINTING'}</span>}
                  </div>
                  <div className="fs-perf" aria-hidden="true" />
                  {v === 'error' ? <ValueState state="not-computed" label="Total cost" reason="The demo audit could not be loaded." size="cell" />
                    : v?.headline ? (
                      <div className="fs-totalline">
                        <span className="k">TOTAL</span>
                        <span className="b">{formatSignedBps(v.headline.totalBps)}</span>
                        <span className="u">{formatUsd(v.headline.totalUsd)}</span>
                      </div>
                    ) : v ? <ValueState state="not-computed" label="Total cost" reason="The orders were not measured." size="cell" />
                      : <p className="g">PRINTING</p>}
                  {v && v !== 'error' && v.headline ? <p className="g mt-3">{v.headline.orders} ORDERS</p> : null}
                  <p className="c mt-4 underline underline-offset-[3px] group-hover:text-ui-ink">Open the audit</p>
                </div>
                <div aria-hidden="true" className="fs-torn-bottom" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
