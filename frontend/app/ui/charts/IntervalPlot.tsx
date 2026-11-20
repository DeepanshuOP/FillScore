'use client'

import { useEffect, useRef, useState } from 'react'
import * as m from 'motion/react-m'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Cost against expected as an interval plot on ONE axis: the difference "paid minus expected", in bps. The expected
 * point sits at zero (hollow ring), the 90% interval of the difference is the band, the paid dot is the measured
 * difference (filled). Drawing paid and expected on one price axis with a band of the difference would mix two
 * quantities, so the axis is the difference and both raw figures are written in the caption beside it.
 *
 * Scale (hand-checked in IntervalPlot.test.ts): the domain is [min(low, diff, 0), max(high, diff, 0)] padded by 15% of
 * its span on each side (at least 0.05 bps), mapped to [pad, width - pad].
 */
export function intervalDomain(low: number | null, high: number | null, diff: number): [number, number] {
  const lo = Math.min(low ?? diff, diff, 0)
  const hi = Math.max(high ?? diff, diff, 0)
  const pad = Math.max((hi - lo) * 0.15, 0.05)
  return [lo - pad, hi + pad]
}

export function IntervalPlot({ diff, low, high, labels }: {
  diff: number
  low: number | null
  high: number | null
  labels: { diff: string; low?: string; high?: string; level: string }
}) {
  // Drawn at its measured pixel width, so the 11 px labels stay 11 px at every card width.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(320)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 64, P = 12, Y = 30
  const [d0, d1] = intervalDomain(low, high, diff)
  const x = (v: number) => P + ((v - d0) / (d1 - d0)) * (W - 2 * P)
  return (
    <div ref={box} className="w-full">
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block overflow-visible" role="img"
      aria-label={`Paid minus expected: ${labels.diff}${low !== null && high !== null ? `, ${labels.level} interval ${labels.low} to ${labels.high}` : ''}`}>
      <line x1={P} x2={W - P} y1={Y} y2={Y} stroke="var(--ui-rule)" strokeWidth={1} />
      {low !== null && high !== null ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <m.rect x={x(low)} y={Y - 9} height={18} rx={4} fill="color-mix(in srgb, var(--ui-measured) 18%, transparent)"
              stroke="color-mix(in srgb, var(--ui-measured) 45%, transparent)" strokeWidth={1}
              initial={{ width: 0, opacity: 0 }} animate={{ width: Math.max(2, x(high) - x(low)), opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          </TooltipTrigger>
          <TooltipContent>{labels.level} interval: {labels.low} to {labels.high}</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <g>
            <line x1={x(0)} x2={x(0)} y1={Y - 16} y2={Y + 16} stroke="var(--ui-edge)" strokeWidth={1} strokeDasharray="2 3" />
            <circle cx={x(0)} cy={Y} r={5} fill="var(--ui-raised)" stroke="var(--ui-graphite)" strokeWidth={2} />
          </g>
        </TooltipTrigger>
        <TooltipContent>Expected (zero difference)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <circle cx={x(diff)} cy={Y} r={6} fill="var(--ui-measured)" stroke="var(--ui-raised)" strokeWidth={2} />
        </TooltipTrigger>
        <TooltipContent>Paid minus expected: {labels.diff}</TooltipContent>
      </Tooltip>
      <text x={x(0)} y={H - 2} textAnchor="middle" fontSize={11} className="fill-ui-graphite">expected</text>
      <text x={x(diff)} y={10} textAnchor="middle" fontSize={11} className="fill-ui-ink font-medium tabular-nums">paid</text>
    </svg>
    </div>
  )
}
