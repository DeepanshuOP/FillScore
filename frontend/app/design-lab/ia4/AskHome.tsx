'use client'

import { useState } from 'react'
import type { RecordedRun } from './data'

/**
 * "Ask FillScore" on the app home (IA v4 prototype). A demo account runs no model on request, so the chips play the RECORDED
 * answers of the real Ask agent (fixtures/ask-recorded.json), shown verbatim and labelled as recorded. The answer prints as a
 * receipt slip: the paper feeds out of the slot, then each line prints (ia4.css; reduced motion: the finished slip).
 */
export function AskHome({ runs, label, recordedAt, context }: { runs: RecordedRun[]; label: string; recordedAt: string; context: string }) {
  const [picked, setPicked] = useState<number | null>(null)
  const run = picked === null ? null : runs[picked]
  // review (step 4): the LLM heading only over text the model wrote; a degraded answer was written by code and says so
  const byModel = run ? run.view.note === null : false
  const lines: Array<{ key: string; node: React.ReactNode; className?: string }> = run ? [
    { key: 'h', node: 'ASK FILLSCORE', className: 'text-center font-mono tracking-[0.08em]' },
    { key: 'r', node: 'RECORDED ANSWER, NOT LIVE', className: 'text-center font-mono text-[12px] tracking-[0.06em] text-ui-graphite' },
    // the account's period and order count, placed by code, so a slip read alone keeps its scope
    { key: 'c', node: context, className: 'text-center font-mono text-[12px] tracking-[0.06em] text-ui-graphite' },
    // DESIGN §4: mono for printed labels only; sentences in the text face
    { key: 'q', node: <><span className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite">QUESTION </span><span className="font-sans text-[15px]">{run.question}</span></>, className: 'mt-3' },
    { key: 'lh', node: byModel ? 'Explanation (language model; every number was checked against the audit)' : 'Written by code from the measured values (no model text)',
      className: 'mt-3 font-sans text-[13px] text-ui-graphite' },
    { key: 'a', node: run.view.answer, className: 'font-sans text-[18px] leading-snug font-bold tracking-[-0.015em]' },
    ...(run.view.note ? [{ key: 'n', node: run.view.note, className: 'font-sans text-[14px] text-ui-graphite' }] : []),
    { key: 'm', node: run.view.meta, className: 'mt-2 font-sans text-[14px] text-ui-graphite' },
    { key: 'w', node: `Answered by ${[...new Set(run.models)].join(', ') || 'no model'} on ${recordedAt.slice(0, 10)}.`, className: 'font-sans text-[14px] text-ui-graphite' },
  ] : []
  return (
    <section aria-labelledby="ask-title" data-testid="ia4-ask">
      <h1 id="ask-title" className="display-md text-ui-ink">Ask FillScore</h1>
      <p className="mt-2 max-w-[60ch] text-[16px] text-ui-graphite">Questions about this account&rsquo;s past executions. Answers use only the stored measurements; every figure is placed by code.</p>
      {/* review (step 4): a demo account gets no input it cannot use; the recorded questions are the interaction. A signed-in
          account gets the live box (production AskPanel) in this place. */}
      <p className="mt-6 text-[16px] text-ui-ink">
        {runs.length
          ? <>Recorded questions. <span className="text-ui-graphite">Demo accounts run no model on request; <a href="/login" className="text-ui-ink underline underline-offset-2">sign in</a> to ask about your own executions.</span></>
          : <>No recorded questions for this demo trader. <span className="text-ui-graphite">Recorded answers exist for the mixed-orders trader; <a href="/login" className="text-ui-ink underline underline-offset-2">sign in</a> to ask about your own executions.</span></>}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Recorded questions">
        {runs.map((r, i) => (
          <li key={r.question} className="max-w-full">
            <button type="button" className="ia4-chip" data-picked={picked === i} onClick={() => setPicked(i)} data-testid="ia4-chip">{r.question}</button>
          </li>
        ))}
      </ul>
      {/* screen readers hear the answer sentence once, not every printed line */}
      <p className="sr-only" role="status">{run ? `Recorded answer: ${run.view.answer}` : ''}</p>
      <div className="mt-6 max-w-[640px]">
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
