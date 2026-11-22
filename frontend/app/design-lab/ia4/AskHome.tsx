'use client'

import { useState } from 'react'
import type { RecordedRun } from './data'

/**
 * "Ask FillScore" on the app home (IA v4 prototype). A demo account runs no model on request, so the chips play the RECORDED
 * answers of the real Ask agent (fixtures/ask-recorded.json), shown verbatim and labelled as recorded. The answer prints as a
 * receipt slip: the paper feeds out of the slot, then each line prints (ia4.css; reduced motion: the finished slip).
 */
export function AskHome({ runs, label, recordedAt }: { runs: RecordedRun[]; label: string; recordedAt: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  const run = picked === null ? null : runs[picked]
  const lines: Array<{ key: string; node: React.ReactNode; className?: string }> = run ? [
    { key: 'h', node: 'ASK FILLSCORE', className: 'text-center font-mono tracking-[0.08em]' },
    { key: 'r', node: 'RECORDED ANSWER, NOT LIVE', className: 'text-center font-mono text-[12px] tracking-[0.06em] text-ui-graphite' },
    // DESIGN §4: mono for printed labels only; sentences in the text face
    { key: 'q', node: <><span className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite">QUESTION </span><span className="font-sans text-[15px]">{run.question}</span></>, className: 'mt-3' },
    { key: 'lh', node: 'Explanation (language model; every number was checked against the audit)', className: 'mt-3 font-sans text-[13px] text-ui-graphite' },
    { key: 'a', node: run.view.answer, className: 'font-sans text-[18px] leading-snug font-bold tracking-[-0.015em]' },
    ...(run.view.note ? [{ key: 'n', node: run.view.note, className: 'font-sans text-[14px] text-ui-graphite' }] : []),
    { key: 'm', node: run.view.meta, className: 'mt-2 font-sans text-[14px] text-ui-graphite' },
    { key: 'w', node: `Answered by ${[...new Set(run.models)].join(', ') || 'no model'} on ${recordedAt.slice(0, 10)}.`, className: 'font-sans text-[14px] text-ui-graphite' },
  ] : []
  return (
    <section aria-labelledby="ask-title" data-testid="ia4-ask">
      <h1 id="ask-title" className="display-md text-ui-ink">Ask FillScore</h1>
      <p className="mt-2 max-w-[60ch] text-[16px] text-ui-graphite">Questions about this account&rsquo;s past executions. Answers use only the stored measurements; every figure is placed by code.</p>
      <form className="mt-6 flex flex-wrap items-stretch gap-2" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="ia4-q" className="sr-only">Your question</label>
        <input id="ia4-q" readOnly value={run?.question ?? ''} placeholder="Ask about your past executions"
          aria-describedby="ia4-q-hint" className="min-h-11 min-w-0 flex-1 basis-64 rounded-[8px] border border-ui-edge bg-ui-raised px-3 text-[16px] text-ui-ink placeholder:text-ui-graphite" />
        <button type="submit" disabled className="min-h-11 rounded-full bg-ui-ink px-5 text-[15px] font-bold text-ui-surface disabled:opacity-60">Ask</button>
      </form>
      <p id="ia4-q-hint" className="mt-2 text-[14px] text-ui-graphite">
        {runs.length
          ? 'Demo account: sign in to ask about your own executions. The questions below show recorded answers.'
          : 'Demo account: sign in to ask about your own executions. Recorded answers exist for the mixed-orders demo trader only.'}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
        {runs.map((r, i) => (
          <li key={r.question} className="max-w-full">
            <button type="button" className="ia4-chip" aria-pressed={picked === i} onClick={() => setPicked(i)} data-testid="ia4-chip">{r.question}</button>
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="mt-6 max-w-[640px]">
        {run ? (
          <div>
            <div className="ia4-slot" aria-hidden="true" />
            <div key={picked} className="ia4-slip fs-receipt" data-print="true" data-testid="ia4-slip">
              {lines.map((l, i) => (
                <p key={l.key} className={`ia4-line ${l.className ?? ''}`} style={{ ['--d' as string]: `${Math.min(i * 18, 360)}ms` }}>{l.node}</p>
              ))}
              {run.view.values.length ? (
                <details className="ia4-line mt-3" style={{ ['--d' as string]: `${Math.min(lines.length * 18, 360)}ms` }}>
                  <summary className="cursor-pointer font-mono text-[12px] tracking-[0.06em]">VALUES USED ({run.view.values.length})</summary>
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] [overflow-wrap:anywhere]">{run.view.values.map((v) => <li key={v}>{v}</li>)}</ul>
                </details>
              ) : null}
              <p className="mt-3 font-sans text-[13px] text-ui-graphite">{label}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
