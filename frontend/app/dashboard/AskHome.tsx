'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { Banner } from '../ui/Banner'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { describeAsk, type AskView } from './askView'
import { recordedAnswers, type RecordedAnswer, type RecordedDoc } from './askRecorded'
import { Fold } from './Overview'
import { viewHref } from '../components/shell/nav'

/**
 * "Ask FillScore", the app's Home (IA v4, step 3). Three states:
 *  - demo: a demo account runs no model on request, so the chips play RECORDED answers of the real agent, verbatim, labelled
 *    "Recorded answer, not live"; there is no input box;
 *  - live: a signed-in account with measured orders asks the existing agent (two budget units per question);
 *  - blocked: a signed-in account without measured orders: Ask is disabled and says why.
 * Every figure in an answer is placed by code. The language-model heading shows only over text the model wrote.
 */
export const LIVE_CHIPS = [
  'What did my orders cost in total?',
  'Which orders cost the most?',
  'What score did my execution get?',
  'How did my market orders compare with the modelled cost?',
] as const

export const ASK_INTRO = "Questions about this account's past executions. Answers use only the stored measurements; every figure is placed by code."
export const LLM_HEADING = 'Explanation (language model; every number was checked against the audit)'

interface SlipData {
  question: string
  view: AskView
  /** The line that says who answered and when (recorded answers only). */
  credit: string | null
  recorded: boolean
  label: string | null
}

/** The printed slip: the paper feeds out of the slot and its lines print in order (appshell.css). */
function Slip({ slip, scope }: { slip: SlipData; scope: string }) {
  const { view } = slip
  const lines: Array<{ key: string; node: ReactNode; className?: string }> = [
    { key: 'h', node: 'ASK FILLSCORE', className: 'text-center font-mono tracking-[0.08em]' },
    ...(slip.recorded ? [{ key: 'r', node: 'RECORDED ANSWER, NOT LIVE', className: 'text-center font-mono text-[12px] tracking-[0.06em] text-ui-graphite' }] : []),
    // the account's period and order count, placed by code, so a slip read alone keeps its scope
    ...(scope ? [{ key: 'c', node: scope, className: 'text-center font-mono text-[12px] tracking-[0.06em] text-ui-graphite uppercase' }] : []),
    { key: 'q', node: <><span className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite">QUESTION </span><span className="font-sans text-[15px]">{slip.question}</span></>, className: 'mt-3' },
    // the heading only over text the model wrote; a code-built sentence says so in its own line instead
    ...(view.byModel ? [{ key: 'lh', node: LLM_HEADING, className: 'mt-3 font-sans text-[13px] text-ui-graphite' }] : []),
    { key: 'a', node: view.answer, className: cnAnswer(view.byModel) },
    ...(view.note ? [{ key: 'n', node: view.note, className: 'font-sans text-[14px] text-ui-graphite' }] : []),
    ...(view.meta ? [{ key: 'm', node: view.meta, className: 'mt-2 font-sans text-[14px] text-ui-graphite' }] : []),
    ...(slip.credit ? [{ key: 'w', node: slip.credit, className: 'font-sans text-[14px] text-ui-graphite' }] : []),
  ]
  return (
    <div>
      <div className="fa-slot" aria-hidden="true" />
      <div className="fa-slip fs-receipt" data-print="true" data-testid="ask-slip">
        {lines.map((l, i) => (
          <p key={l.key} className={`fa-line ${l.className ?? ''}`} style={{ ['--d' as string]: `${Math.min(i * 18, 360)}ms` }}>{l.node}</p>
        ))}
        {view.values.length ? (
          <div className="fa-line mt-3" style={{ ['--d' as string]: `${Math.min(lines.length * 18, 360)}ms` }}>
            <Fold label={`Values used (${view.values.length})`} testId="ask-values">
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] [overflow-wrap:anywhere]">{view.values.map((v) => <li key={v}>{v}</li>)}</ul>
            </Fold>
          </div>
        ) : null}
        {slip.label ? <p className="mt-3 font-sans text-[13px] text-ui-graphite">{slip.label}</p> : null}
      </div>
    </div>
  )
}
const cnAnswer = (byModel: boolean) => `font-sans text-[18px] leading-snug font-bold tracking-[-0.015em]${byModel ? '' : ' mt-3'}`

function Chips({ items, onPick, picked, disabled, label }: { items: readonly string[]; onPick: (i: number) => void; picked: number | null; disabled?: boolean; label: string }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label={label}>
      {items.map((q, i) => (
        <li key={q} className="max-w-full">
          <button type="button" className="fa-chip" data-picked={picked === i} disabled={disabled} onClick={() => onPick(i)} data-testid="ask-chip">{q}</button>
        </li>
      ))}
    </ul>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="ask-title" data-testid="ask-home">
      <h1 id="ask-title" className="display-md text-ui-ink">Ask FillScore</h1>
      <p className="mt-2 max-w-[60ch] text-[16px] text-ui-graphite">{ASK_INTRO}</p>
      {children}
    </section>
  )
}

/** A demo account: recorded questions only. */
function RecordedAsk({ demoId, signedIn, scope }: { demoId: string; signedIn: boolean; scope: string }) {
  const [doc, setDoc] = useState<RecordedDoc | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    // the recorded answers are their own chunk: only a demo page fetches them
    // 2026-11-23 (ADR-0018): the answers recorded with the typed-claims path; the first recording (ask-recorded.json) stays beside it, unchanged
    void import('../lib/ask/ask-recorded-claims.json').then((m) => { if (live) setDoc(m.default as unknown as RecordedDoc) }).catch(() => undefined)
    return () => { live = false }
  }, [])
  const answers: RecordedAnswer[] = doc && doc.account === demoId ? recordedAnswers(doc) : []
  const a = picked === null ? null : answers[picked]
  return (
    <Frame>
      <p className="mt-6 text-[16px] text-ui-ink">
        {answers.length ? 'Recorded questions. ' : doc ? 'No recorded questions for this demo trader. ' : ''}
        <span className="text-ui-graphite">
          {doc && !answers.length ? (
            <>Recorded answers exist for <Link href={viewHref('home', 'demo-moderate', signedIn)} className="text-ui-ink underline underline-offset-2">the mixed-orders trader</Link>. </>
          ) : ''}
          Demo accounts run no model on request;{' '}
          {signedIn
            ? <Link href="/app" className="text-ui-ink underline underline-offset-2">open your own account</Link>
            : <><Link href="/signup" className="text-ui-ink underline underline-offset-2">sign up</Link> or <Link href="/login" className="text-ui-ink underline underline-offset-2">log in</Link></>} to ask about your own executions.
        </span>
      </p>
      {answers.length ? <Chips items={answers.map((x) => x.question)} onPick={setPicked} picked={picked} label="Recorded questions" /> : null}
      {/* screen readers hear the answer sentence once, not every printed line */}
      <p className="sr-only" role="status">{a?.view.answer ? `Recorded answer: ${a.view.answer}${a.view.note ? ` ${a.view.note}` : ''}` : ''}</p>
      <div className="mt-6 max-w-[640px]">
        {a && doc ? <Slip key={picked} scope={scope} slip={{ question: a.question, view: a.view, credit: a.credit, recorded: true, label: doc.label }} /> : null}
      </div>
    </Frame>
  )
}

/** A signed-in account with measured orders: the live agent. */
function LiveAsk({ mlBaseUrl, accessToken, scope }: { mlBaseUrl: string; accessToken: string | null | undefined; scope: string }) {
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState<string | null>(null)
  const [view, setView] = useState<AskView | null>(null)
  const [n, setN] = useState(0)

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setBusy(true); setView(null); setAsked(q)
    try {
      const res = await fetch(`${mlBaseUrl}/ml/agents/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ question: q }),
      })
      setView(describeAsk(res.status, await res.json().catch(() => null)))
    } catch {
      setView(describeAsk(0, null))
    } finally {
      setBusy(false); setN((x) => x + 1)
    }
  }
  return (
    <Frame>
      <div className="mt-6 flex max-w-[760px] flex-wrap items-end gap-3" data-testid="ask-panel">
        <Field label="Ask about your past executions" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300}
          placeholder="For example: which orders cost the most?" onKeyDown={(e) => { if (e.key === 'Enter') void send(question) }} disabled={busy} className="min-w-64 flex-1" />
        <Button onClick={() => void send(question)} disabled={!question.trim()} loading={busy}>{busy ? 'Asking…' : 'Ask'}</Button>
      </div>
      <Chips items={LIVE_CHIPS} picked={null} disabled={busy} label="Suggested questions" onPick={(i) => { setQuestion(LIVE_CHIPS[i]); void send(LIVE_CHIPS[i]) }} />
      <p className="sr-only" role="status">{view?.answer ? `${view.answer}${view.note ? ` ${view.note}` : ''}` : ''}</p>
      {view?.error ? <div data-testid="ask-error" className="mt-4 max-w-[640px]"><Banner kind="refused" title={view.error} /></div> : null}
      <div className="mt-6 max-w-[640px]" data-testid="ask-answer">
        {view?.answer && asked ? <Slip key={n} scope={scope} slip={{ question: asked, view, credit: null, recorded: false, label: null }} /> : null}
      </div>
    </Frame>
  )
}

/** A signed-in account without measured orders. */
function BlockedAsk() {
  return (
    <Frame>
      <div className="mt-6 flex max-w-[760px] flex-wrap items-end gap-3" data-testid="ask-panel">
        <Field label="Ask about your past executions" disabled placeholder="Ask needs measured orders." className="min-w-64 flex-1" />
        <Button disabled>Ask</Button>
      </div>
      <p className="mt-3 text-[15px] text-ui-graphite" data-testid="ask-disabled">Ask needs measured orders.</p>
    </Frame>
  )
}

export type AskHomeProps =
  | { mode: 'demo'; demoId: string; signedIn: boolean; scope: string }
  | { mode: 'live'; mlBaseUrl: string; accessToken: string | null | undefined; scope: string }
  | { mode: 'blocked' }

export function AskHome(p: AskHomeProps) {
  if (p.mode === 'demo') return <RecordedAsk demoId={p.demoId} signedIn={p.signedIn} scope={p.scope} />
  if (p.mode === 'live') return <LiveAsk mlBaseUrl={p.mlBaseUrl} accessToken={p.accessToken} scope={p.scope} />
  return <BlockedAsk />
}
