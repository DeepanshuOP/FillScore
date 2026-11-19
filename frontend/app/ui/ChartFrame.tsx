'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { hueCss, hueShare } from './hue'

/** One hue (the measured colour) for every mark, deeper for larger, never paler than 65% (see hue.ts). */
export function singleHue(t: number): string {
  return hueCss(hueShare(t))
}

/** `unmeasured`: the value is stated, not measured (for example a demo fee at the published rate). Its bar is an outline,
 *  not the measured colour, so the colour keeps meaning "measured". */
export interface BarRow { label: string; value: number; valueLabel: string; note?: string; unmeasured?: boolean }

/**
 * Horizontal bars with the value written at the end of each bar (no legend to decode), on one hue. Bar length is
 * proportional to the value from zero. Not interactive; the table beside it is the accessible form.
 */
export function BarList({ rows, className }: { rows: BarRow[]; className?: string }) {
  // One zero line shared by every bar; a negative value extends to the left of it, in the same hue (money is never
  // coloured good or bad). The sign is written in the label.
  const lo = Math.min(0, ...rows.map((r) => r.value))
  const hi = Math.max(0, ...rows.map((r) => r.value))
  const range = hi - lo || Number.EPSILON
  const biggest = Math.max(...rows.map((r) => Math.abs(r.value)), Number.EPSILON)
  return (
    <ul className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[8rem_1fr_auto]">
          <span className="text-sm text-ui-ink">{r.label}</span>
          <span className="relative block h-5">
            <span className="absolute inset-y-0 w-px bg-ui-edge" style={{ left: `${(-lo / range) * 100}%` }} />
            <span className={cn('absolute inset-y-0.5 rounded-[1px]', r.unmeasured && 'border-2 border-dashed border-ui-graphite')}
              style={{ left: `${((Math.min(0, r.value) - lo) / range) * 100}%`, width: `${(Math.abs(r.value) / range) * 100}%`, minWidth: '2px',
                background: r.unmeasured ? 'transparent' : singleHue(Math.abs(r.value) / biggest) }} />
          </span>
          <span className="min-w-20 text-right text-sm tabular-nums text-ui-ink">{r.valueLabel}{r.note ? <span className="block text-xs text-ui-graphite">{r.note}</span> : null}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * A chart and its table. The frame names what is drawn, says in one sentence what it shows, and always offers the same
 * numbers as a table (a chart is never the only form). Colour carries nothing the labels do not.
 */
export function ChartFrame({ title, summary, chart, table, source }: { title: string; summary: string; chart: ReactNode; table: ReactNode; source?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const tab = (v: 'chart' | 'table', label: string) => (
    <button type="button" aria-pressed={view === v} onClick={() => setView(v)}
      className={cn('border-b-2 px-0 py-1 text-sm', view === v ? 'border-ui-ink font-semibold text-ui-ink' : 'border-transparent text-ui-graphite hover:text-ui-ink')}>{label}</button>
  )
  return (
    <figure className="border-t border-ui-rule pt-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="max-w-[68ch]">
          <p className="text-[1.25rem] leading-7 font-semibold text-ui-ink">{title}</p>
          <p className="mt-1 text-sm text-ui-graphite">{summary}</p>
        </div>
        <div className="flex gap-4" role="group" aria-label="Show as">{tab('chart', 'Chart')}{tab('table', 'Table')}</div>
      </figcaption>
      <div role="img" aria-label={view === 'chart' ? `${title}: ${summary}` : undefined} hidden={view !== 'chart'}>{chart}</div>
      <div hidden={view !== 'table'}>{table}</div>
      {source ? <p className="mt-3 text-sm text-ui-graphite">{source}</p> : null}
    </figure>
  )
}
