import type { StripView } from '../../../dashboard/costStrip'
import { InfoTip } from './PageHeader'

/** KPI tile (PROPOSAL §3.3): label 13 px, value 28 px tabular, one sub-line. */
export function Tile({ label, value, sub, testid }: { label: string; value: React.ReactNode; sub?: React.ReactNode; testid?: string }) {
  return (
    <div className="v-card flex min-w-0 flex-col gap-1 p-4" data-testid={testid}>
      <p className="text-[13px] font-medium text-[var(--v-text-2)]">{label}</p>
      <p className="text-[24px] font-bold leading-tight tracking-[-0.02em] sm:text-[28px]">{value}</p>
      {sub ? <p className="text-[14px] text-[var(--v-text-2)]">{sub}</p> : null}
    </div>
  )
}

/** Card with a 16 px title, one sentence, optional info, the content and a source line. */
export function Card({ title, sentence, info, source, children, className, id }: {
  title: string; sentence?: React.ReactNode; info?: string; source?: string; children: React.ReactNode; className?: string; id?: string
}) {
  return (
    <section className={`v-card flex min-w-0 flex-col gap-3 p-4 lg:p-5 ${className ?? ''}`} aria-labelledby={id ? `${id}-t` : undefined}>
      <div>
        <h2 id={id ? `${id}-t` : undefined} className="flex items-center gap-1 text-[16px] font-semibold">{title}{info ? <InfoTip label={title} text={info} /> : null}</h2>
        {sentence ? <p className="mt-0.5 text-[14px] text-[var(--v-text-2)]">{sentence}</p> : null}
      </div>
      {children}
      {source ? <p className="text-[12px] text-[var(--v-muted)]">{source}</p> : null}
    </section>
  )
}

const PART_COLOR: Record<string, string> = { fees: 'var(--v-s1)', missed: 'var(--v-s2)', execution: 'var(--v-s3)' }
/**
 * "Where the cost came from": one stacked bar whose widths are the server's shares (production `describeStrip`, which also
 * writes the labels and the dashed fee basis). A part without positive dollars has no width and is named beside the bar.
 */
export function CostBreakdown({ view }: { view: StripView }) {
  const drawn = view.parts.filter((p) => p.drawn)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={view.sentence}>
        {drawn.map((p) => (
          <div key={p.key} style={{ width: p.width, background: PART_COLOR[p.key], backgroundImage: p.dashed ? 'repeating-linear-gradient(135deg, rgb(255 255 255 / 0.28) 0 4px, transparent 4px 9px)' : undefined }}
            className="h-full first:rounded-l-md last:rounded-r-md" />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {view.parts.map((p) => (
          <li key={p.key} className="flex min-w-0 items-start gap-2">
            <span aria-hidden="true" className="mt-1.5 inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: p.drawn ? PART_COLOR[p.key] : 'transparent', outline: p.drawn ? undefined : '1px solid var(--v-border-strong)' }} />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{p.label}</span>
              <span className="block text-[16px] font-semibold">{p.amount}</span>
              {p.caption ? <span className="block text-[13px] text-[var(--v-text-2)]">{p.caption}</span> : null}
              {!p.drawn ? <span className="block text-[13px] text-[var(--v-text-2)]">not drawn: no positive cost</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[14px] text-[var(--v-text-2)]">{view.sentence}</p>
    </div>
  )
}

/** The grade's score inside its served range, on a 0 to 100 bar (CSS widths from served values only). */
export function GradeRange({ score, band }: { score: number; band: [number, number] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 w-full rounded-full bg-[var(--v-surface-2)] ring-1 ring-[var(--v-border)]" role="img" aria-label={`Score ${score.toFixed(1)} of 100, range ${band[0].toFixed(1)} to ${band[1].toFixed(1)}`}>
        <div className="absolute inset-y-0 rounded-full bg-[var(--v-s1)]/30" style={{ left: `${band[0]}%`, width: `${band[1] - band[0]}%` }} />
        <div className="absolute -top-1 h-[18px] w-[3px] rounded bg-[var(--v-text)]" style={{ left: `${score}%` }} />
      </div>
      <div className="flex justify-between text-[12px] text-[var(--v-text-2)]"><span>0</span><span>100</span></div>
    </div>
  )
}
