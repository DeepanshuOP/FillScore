'use client'

import { useEffect, useRef, useState } from 'react'
import { bracketPath } from '../pen'

/**
 * Cost against expected, drawn as a bracket on a ruler (design v3). One axis only: paid minus expected, in bps
 * (DESIGN.md, "Data"). The expected point is the ruler's zero (a hollow ring), the paid dot sits at the difference,
 * and the pen brackets the 90% interval of the difference above the ruler. Every value is also printed as text: the pen
 * bracket doubles the penInk label, it never states the interval alone.
 */
export function CostRuler({ diff, low, high, labels, n, draw = false }: {
  diff: number; low: number | null; high: number | null; n: number
  /** Design v3.1: draw the pen's bracket once (the overview chapter's first entry); otherwise it is simply there. */
  draw?: boolean
  labels: { diff: string; low: string; high: string; level: string }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const hasRange = low !== null && high !== null
  const lo0 = Math.min(0, diff, hasRange ? low! : diff), hi0 = Math.max(0, diff, hasRange ? high! : diff)
  const span = hi0 - lo0 || 1
  const lo = lo0 - span * 0.25, hi = hi0 + span * 0.25
  const H = 132, Y = 78, PADX = 12
  const x = (v: number) => PADX + ((v - lo) / (hi - lo)) * Math.max(1, w - 2 * PADX)
  const step = niceStep((hi - lo) / 6)
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(10)))
  const paidLeft = diff < 0
  return (
    <figure className="fs-ruler m-0" data-draw={draw}>
      <div ref={ref} className="relative w-full" style={{ height: H }}>
        {w > 0 ? (
          <svg width={w} height={H} className="block overflow-visible" role="img"
            aria-label={`Paid minus expected: ${labels.diff}${hasRange ? `, ${labels.level} interval ${labels.low} to ${labels.high}` : ''}, ${n} orders. Zero is the expected cost.`}>
            <line x1={PADX} x2={w - PADX} y1={Y} y2={Y} stroke="var(--ui-ink)" />
            {ticks.map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={Y} y2={Y + (Math.abs(v) < 1e-9 ? 10 : 6)} stroke="var(--ui-graphite)" />
                <text x={x(v)} y={Y + 22} textAnchor="middle" className="fill-ui-graphite font-mono text-[10px]">{fmt(v)}</text>
              </g>
            ))}
            {hasRange ? (
              <>
                <path className="fs-pen" pathLength={1} d={bracketPath(x(low!), x(high!), Y - 22, -9, 5)} fill="none" stroke="var(--ui-pen)" strokeWidth={2.2} strokeLinecap="round" />
                <text x={(x(low!) + x(high!)) / 2} y={Y - 32} textAnchor="middle" className="fill-ui-pen-ink text-[13px] font-bold">{labels.level} range {labels.low} to {labels.high}</text>
              </>
            ) : null}
            <circle cx={x(0)} cy={Y} r={5.5} fill="var(--ui-raised)" stroke="var(--ui-ink)" strokeWidth={1.5} />
            <circle cx={x(diff)} cy={Y} r={5} fill="var(--ui-ink)" />
            <text x={x(diff) + (paidLeft ? -8 : 8)} y={Y + 40} textAnchor={paidLeft ? 'end' : 'start'} className="fill-ui-ink text-[13px] font-bold">paid {labels.diff}</text>
            <text x={x(0) + (paidLeft ? 8 : -8)} y={Y + 40} textAnchor={paidLeft ? 'start' : 'end'} className="fill-ui-graphite text-[13px]">expected 0</text>
          </svg>
        ) : null}
      </div>
      <figcaption className="font-mono text-[11px] text-ui-graphite">PAID MINUS EXPECTED, BPS. n = {n} market orders</figcaption>
    </figure>
  )
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}
function fmt(v: number): string {
  if (Math.abs(v) < 1e-9) return '0'
  const s = Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2)
  return s.replace('-', '−')
}
