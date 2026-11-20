'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, KeyRound, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { formatSignedBps, formatUsd } from '../../ui/format'
import { linearScale } from '../../ui/tape/geometry'
import inputs from '../../design-lab/fixtures/landing-order.inputs.json'
import replay from '../../design-lab/fixtures/landing-order.replay.json'

/**
 * The scroll story of the landing page: four steps on the left, one pinned instrument on the right whose scene changes
 * with the step in view (connect a read-only key, fetch the public prints, measure each fill, the cost ledger). The
 * pane is CSS-sticky (pinned); ScrollTrigger scrubs the progress rail and a slight drift of the scene with the scroll.
 * On phones and with reduced motion each step shows its own scene inline, and nothing is pinned or scrubbed.
 * The figures are the landing order's (replay data and public prints in the fixture).
 */
const fig = Object.fromEntries(replay.decomposition.map((f) => [f.key, f]))
const prints = inputs.tape.prints

const STEPS = [
  { title: 'Connect a read-only key', text: 'FillScore checks the key’s permissions before it stores anything. A key that can trade or withdraw is refused, and the reason says what to switch off on the exchange.' },
  { title: 'The public prints are fetched', text: 'For every fill, FillScore downloads the exchange’s own public trade file for that day and checks it against its published SHA-256 before reading a single print.' },
  { title: 'Each fill is measured', text: 'The spread paid, the price impact and timing, the cost of the part of an order that never filled, and the fees against the rates the account qualified for.' },
  { title: 'The cost is written down', text: 'Every term in dollars and basis points, each with the stored field it came from. A value that could not be measured says “insufficient data” instead of a guess.' },
] as const

function KeyScene() {
  const rows: Array<[string, boolean, string]> = [['Read account history', true, 'Allowed'], ['Spot and margin trading', false, 'Refused'], ['Withdrawals', false, 'Refused']]
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[9px] bg-ui-overlay"><KeyRound aria-hidden="true" className="size-4 text-ui-ink" /></span>
        <div><p className="text-sm font-medium text-ui-ink">API key permissions</p><p className="text-[12px] text-ui-graphite">Checked before the key is stored, then encrypted</p></div>
      </div>
      <ul className="flex flex-col divide-y divide-ui-rule rounded-[12px] ring-1 ring-inset ring-ui-rule">
        {rows.map(([label, ok, state]) => (
          <li key={label} className="flex items-center justify-between px-4 py-3 text-[13px]">
            <span className="text-ui-ink">{label}</span>
            <span className={cn('inline-flex items-center gap-1.5', ok ? 'text-ui-measured' : 'text-ui-danger')}>
              {ok ? <Check aria-hidden="true" className="size-3.5" /> : <X aria-hidden="true" className="size-3.5" />}{state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PrintsScene() {
  const W = 420, H = 220
  const t0 = prints[0].ts, t1 = prints[prints.length - 1].ts
  const ps = prints.map((p) => p.price)
  const x = linearScale(t0, t1, 16, W - 16)
  const y = linearScale(Math.min(...ps) - 0.5, Math.max(...ps) + 0.5, H - 24, 16)
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden="true">
        {prints.map((p) => <circle key={p.id} cx={x(p.ts)} cy={y(p.price)} r={3 + Math.min(4, Math.log10(1 + p.qty * 100))} fill={p.buyerInitiated ? 'var(--ui-graphite)' : 'transparent'} stroke="var(--ui-graphite)" strokeWidth={1.25} />)}
      </svg>
      <p className="text-[12px] text-ui-graphite">
        {prints.length} public prints of {inputs.tape.symbol}, {inputs.tape.date}. Source file SHA-256{' '}
        <code className="font-ui-mono text-[11px] text-ui-ink">{inputs.tape.sourceSha256.slice(0, 16)}</code>
      </p>
    </div>
  )
}

function MeasureScene() {
  const rows = [['spread', 'Spread paid'], ['impactTiming', 'Impact and timing'], ['unfilled', 'Unfilled part'], ['fees', 'Fees']] as const
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-6">
      <p className="text-[13px] text-ui-graphite">One market sell of {inputs.tape.symbol}, two fills at the bid</p>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([k, label]) => (
          <div key={k} className="rounded-[12px] bg-ui-overlay/60 p-4 ring-1 ring-inset ring-ui-rule">
            <dt className="text-[12px] text-ui-graphite">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tracking-[-0.015em] tabular-nums text-ui-ink">{formatSignedBps(fig[k].bps)}</dd>
            <dd className="text-[12px] tabular-nums text-ui-graphite">{formatUsd(fig[k].usd)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function LedgerScene() {
  return (
    <div className="flex h-full flex-col justify-center gap-2 p-6">
      {replay.decomposition.map((f) => (
        <div key={f.key} className={cn('grid grid-cols-[1fr_auto_auto] items-baseline gap-4 border-t border-ui-rule py-2 text-[13px]', f.key === 'total' && 'font-medium')}>
          <span className={cn('text-ui-ink', f.partOf && 'pl-4 text-ui-graphite')}>{f.label}<code className="ml-2 font-ui-mono text-[10.5px] text-ui-graphite">{f.source.field}</code></span>
          <span className="tabular-nums text-ui-ink">{formatSignedBps(f.bps)}</span>
          <span className="w-16 text-right tabular-nums text-ui-graphite">{formatUsd(f.usd)}</span>
        </div>
      ))}
    </div>
  )
}

const SCENES = [KeyScene, PrintsScene, MeasureScene, LedgerScene]

export function ScrollStory() {
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const steps = [...el.querySelectorAll<HTMLElement>('[data-step]')]
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step))
    }, { rootMargin: '-45% 0px -45% 0px' })
    steps.forEach((s) => io.observe(s))

    let revert = () => {}
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
        gsap.registerPlugin(ScrollTrigger)
        const mm = gsap.matchMedia()
        mm.add('(min-width: 1024px)', () => {
          gsap.fromTo(el.querySelector('[data-rail]'), { scaleY: 0 }, { scaleY: 1, ease: 'none', transformOrigin: '50% 0%', scrollTrigger: { trigger: el, start: 'top 60%', end: 'bottom 60%', scrub: 0.6 } })
          gsap.fromTo(el.querySelector('[data-pane]'), { y: 24 }, { y: -24, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } })
        })
        revert = () => mm.revert()
      }).catch(() => {})
    }
    return () => { io.disconnect(); revert() }
  }, [])

  return (
    <section ref={root} aria-labelledby="story-title" className="relative mx-auto max-w-[1240px] px-5 py-24 sm:px-8 lg:py-36">
      <div className="max-w-2xl">
        <h2 id="story-title" data-split className="display-lg text-ui-ink">From a read-only key to a written-down cost.</h2>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-7 text-ui-graphite">Four steps run for every order. Nothing is estimated where it can be measured, and nothing is invented where it cannot.</p>
      </div>
      <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <ol className="relative flex flex-col">
          <span aria-hidden="true" className="absolute top-2 bottom-2 left-[11px] hidden w-px bg-ui-rule lg:block" />
          <span aria-hidden="true" data-rail className="absolute top-2 bottom-2 left-[11px] hidden w-px origin-top bg-ui-measured lg:block" />
          {STEPS.map((s, i) => {
            const Scene = SCENES[i]
            return (
              <li key={s.title} data-step={i} className="relative flex flex-col justify-center gap-3 py-8 lg:min-h-[72vh] lg:pl-12">
                <span aria-hidden="true" className={cn('absolute top-1/2 left-0 hidden size-[23px] -translate-y-1/2 place-items-center rounded-full border text-[11px] font-medium tabular-nums transition-colors duration-300 lg:grid',
                  active >= i ? 'border-ui-measured bg-ui-surface text-ui-measured' : 'border-ui-rule bg-ui-surface text-ui-graphite')}>{i + 1}</span>
                <h3 className={cn('text-[1.5rem] font-semibold tracking-[-0.02em] transition-colors duration-300 sm:text-[1.75rem]', active === i ? 'text-ui-ink' : 'text-ui-ink lg:text-ui-graphite')}>{s.title}</h3>
                <p className="max-w-[46ch] text-[15px] leading-6 text-ui-graphite">{s.text}</p>
                <div className="panel mt-4 overflow-hidden lg:hidden"><Scene /></div>
              </li>
            )
          })}
        </ol>
        <div className="hidden lg:block">
          <div className="sticky top-[18vh]">
            <div data-pane className="panel relative aspect-[5/4] overflow-hidden">
              {SCENES.map((Scene, i) => (
                <div key={i} aria-hidden={active !== i} className={cn('absolute inset-0 transition-[opacity,transform,filter] duration-500 ease-out motion-reduce:transition-none',
                  active === i ? 'opacity-100 blur-0' : 'pointer-events-none translate-y-3 opacity-0 blur-[2px]')}>
                  <Scene />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
