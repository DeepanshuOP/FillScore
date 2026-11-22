import Link from 'next/link'
import '../ia4.css'
import { AppShell4 } from '../AppShell4'
import { SECTIONS, type SectionId } from '../sections'
import { AskHome } from '../AskHome'
import { demoTraders, keyFigures, recordedAsk } from '../data'
import { GradeStamp } from '../../../ui/GradeStamp'
import { splitSign } from '../../../dashboard/costStrip'
import { ValueState } from '../../../ui/ValueState'

/**
 * IA v4 prototype: the app home "Ask FillScore" with the account's key figures under it, inside the proposed shell (sidebar on a
 * desktop, a bottom bar of four on a phone). Design lab only (404 in production). Demo account demo-moderate; every figure comes from
 * committed fixtures through the production model functions (data.ts); the Ask answers are the real agent's recorded output.
 */
export default async function Ia4App({ searchParams }: { searchParams: Promise<{ s?: string; userId?: string }> }) {
  const { s, userId } = await searchParams
  const active = (SECTIONS.find((x) => x.id === s)?.id ?? 'home') as SectionId
  const trader = demoTraders().find((t) => t.id === userId) ?? demoTraders().find((t) => t.id === 'demo-moderate')!
  const k = keyFigures(trader.id)
  const ask = recordedAsk()
  const section = SECTIONS.find((x) => x.id === active)!
  return (
    <AppShell4 active={active} userId={trader.id} account={trader.name} provenance={k.provenance} period={k.periodLabel} version={k.grade?.version ?? 'v2.3.0'}>
      {active === 'home' ? (
        <div className="flex flex-col gap-16">
          {/* answers were recorded for one demo trader only; the others say so instead of borrowing its answers */}
          <AskHome runs={trader.id === ask.account ? ask.runs : []} label={ask.label} recordedAt={ask.recordedAt} />

          <section aria-labelledby="kf-title" className="border-t border-ui-ink pt-8" data-testid="ia4-key-figures">
            <h2 id="kf-title" className="sr-only">Key figures, {k.periodLabel}</h2>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0">
                <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">01 TOTAL</p>
                {k.headline && k.totalText ? (
                  <>
                    <p className="display-lg mt-2 text-ui-ink" data-testid="ia4-total">{k.totalText}</p>
                    <p className="mt-3 max-w-[48ch] text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">{k.totalSentence}</p>
                  </>
                ) : <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />}
              </div>
              {k.grade ? <GradeStamp grade={k.grade.letter} score={k.grade.score} period={k.periodLabel} version={k.grade.version} size="sm" /> : null}
            </div>

            <div className="mt-12">
              <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">02 WHERE IT WENT</p>
              {k.strip ? (
                <>
                  <p className="mt-2 text-[18px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">{k.strip.sentence}</p>
                  <div className="fs-cost-strip mt-4" data-testid="ia4-strip">
                    <div className="fs-cost-strip-paper" role="img" aria-label={k.strip.parts.map((p) => `${p.label} ${p.amount}${p.caption ? `, ${p.caption}` : ''}`).join('; ')}>
                      {k.strip.parts.filter((p) => p.drawn).map((p) => <span key={p.key} className="fs-seg" data-key={p.key} data-dashed={p.dashed} style={{ width: p.width }} />)}
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
                    {k.strip.parts.map((p) => (
                      <li key={p.key} className="flex items-start gap-2.5">
                        <span aria-hidden="true" className="fs-seg-key mt-1.5" data-key={p.key} data-dashed={p.dashed} data-below={p.usd < 0} />
                        <div>
                          <p className="text-[15px] text-ui-ink">{p.label}</p>
                          <p className="font-mono text-[20px] text-ui-ink">{splitSign(p.amount)[0] ? <span className="font-sans">{splitSign(p.amount)[0]}</span> : null}{splitSign(p.amount)[1]}</p>
                          {p.dashed ? <p className="text-[13px] text-ui-graphite">Not independently measured: fees at the published rate.</p> : null}
                          {p.caption ? <p className="text-[13px] text-ui-graphite">{p.caption}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <ValueState state="not-computed" label="Where the money went" reason="The orders were not measured, so there is no cost to split." />}
            </div>
            <p className="mt-10"><Link href={`/design-lab/ia4/app?s=overview&userId=${trader.id}`}className="text-[16px] font-bold text-ui-ink underline underline-offset-4">Read the full overview</Link></p>
          </section>
        </div>
      ) : (
        <section aria-labelledby="ph-title" className="max-w-[60ch]">
          <h1 id="ph-title" className="display-md text-ui-ink">{section.label}</h1>
          <p className="mt-3 text-[16px] text-ui-graphite">Not part of this prototype. The page moves as it is: today at <code className="font-mono text-[14px]">{section.today}</code>, proposed at <code className="font-mono text-[14px]">{section.proposed}</code>, with a permanent redirect from the old address.</p>
        </section>
      )}
    </AppShell4>
  )
}
