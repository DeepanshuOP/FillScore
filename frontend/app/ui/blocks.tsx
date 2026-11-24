'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '../../lib/utils'
import type { StripView } from '../dashboard/costStrip'

/**
 * Design v5 page blocks (PROPOSAL §3.3), promoted from the prototype to the production tokens (`--ui-*` inside `data-app`).
 * Presentation only: every value a block prints is passed in, already formatted by a view model or `app/lib/format.ts`.
 */

/** KPI tile: a 13 px label, a 28 px tabular figure, one sub-line. A tile that cannot show a figure says so in words in `value`. */
export function Tile({ label, value, sub, testid, className }: { label: string; value: ReactNode; sub?: ReactNode; testid?: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-xl border border-ui-rule bg-ui-raised p-4 shadow-ui', className)} data-testid={testid}>
      <p className="text-[13px] font-medium text-ui-graphite">{label}</p>
      <p className="kpi-figure text-[24px] text-ui-ink sm:text-[28px]">{value}</p>
      {sub ? <p className="text-[14px] leading-snug text-ui-graphite">{sub}</p> : null}
    </div>
  )
}

/** An "i" button that opens the method in a popover (a tap on a phone). The sentence a reader needs is printed in the card, not only here. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`About: ${label}`}
          className="inline-grid size-7 place-items-center rounded-lg text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink pointer-coarse:size-11">
          <Info aria-hidden="true" className="size-[15px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent data-app align="start" className="w-[min(320px,calc(100vw-32px))] border border-ui-rule bg-ui-raised text-[13px] leading-snug text-ui-graphite">{text}</PopoverContent>
    </Popover>
  )
}

/** A white card: a 16 px title, one sentence, optional info, the content and a 12 px source line that names the data (never an API path). */
export function Card({ title, sentence, info, source, children, className, id, testid }: {
  title: ReactNode; sentence?: ReactNode; info?: string; source?: ReactNode; children: ReactNode; className?: string; id?: string; testid?: string
}) {
  const label = typeof title === 'string' ? title : 'this card'
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-xl border border-ui-rule bg-ui-raised p-4 shadow-ui lg:p-5', className)} aria-labelledby={id ? `${id}-t` : undefined} data-testid={testid}>
      <div>
        <h2 id={id ? `${id}-t` : undefined} className="flex items-center gap-1 text-[16px] font-semibold text-ui-ink">{title}{info ? <InfoTip label={label} text={info} /> : null}</h2>
        {sentence ? <p className="mt-0.5 text-[14px] leading-snug text-ui-graphite">{sentence}</p> : null}
      </div>
      {children}
      {source ? <p className="text-[12px] text-ui-graphite">{source}</p> : null}
    </section>
  )
}

const PART_COLOR: Record<string, string> = { fees: 'var(--ui-series-1)', missed: 'var(--ui-series-2)', execution: 'var(--ui-series-3)' }

/**
 * "Where the cost came from": one stacked bar whose widths are the server's shares (`describeStrip`, which also writes the labels and
 * the dashed fee basis). A part without positive dollars has no width and is named beside the bar. Each part is also named in text,
 * with its dollars, so the bar never carries a part by colour alone.
 */
export function CostBreakdown({ view }: { view: StripView }) {
  const drawn = view.parts.filter((p) => p.drawn)
  return (
    <div className="flex flex-col gap-3" data-testid="cost-breakdown">
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={view.sentence}>
        {drawn.map((p) => (
          <div key={p.key} style={{ width: p.width, background: PART_COLOR[p.key] }} data-dashed={p.dashed ? 'true' : undefined}
            className="fa-part h-full first:rounded-l-md last:rounded-r-md" />
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {view.parts.map((p) => (
          <li key={p.key} className="flex min-w-0 items-start gap-2">
            <span aria-hidden="true" className="mt-1.5 inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: p.drawn ? PART_COLOR[p.key] : 'transparent', outline: p.drawn ? undefined : '1px solid var(--ui-edge)' }} />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ui-ink">{p.key === 'missed' ? 'Unfilled orders (modelled)' : p.label}</span>
              <span className="block text-[16px] font-semibold text-ui-ink">{p.amount}</span>
              {p.caption ? <span className="block text-[13px] leading-snug text-ui-graphite">{p.caption}</span> : null}
              {!p.drawn ? <span className="block text-[13px] text-ui-graphite">not drawn: no positive cost</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[14px] text-ui-graphite">{view.sentence}</p>
    </div>
  )
}

/** The grade's score inside its served range, on a 0 to 100 bar (CSS widths from served values only). */
export function GradeRange({ score, band }: { score: number; band: [number, number] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 w-full rounded-full bg-ui-overlay ring-1 ring-ui-rule" role="img" aria-label={`Score ${score.toFixed(1)} of 100, range ${band[0].toFixed(1)} to ${band[1].toFixed(1)}`}>
        <div className="absolute inset-y-0 rounded-full opacity-30" style={{ left: `${band[0]}%`, width: `${band[1] - band[0]}%`, background: 'var(--ui-series-1)' }} />
        <div className="absolute -top-1 h-[18px] w-[3px] rounded bg-ui-ink" style={{ left: `${score}%` }} />
      </div>
      <div className="flex justify-between text-[12px] text-ui-graphite"><span>0</span><span>100</span></div>
    </div>
  )
}
