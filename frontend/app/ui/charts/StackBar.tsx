'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '../../../lib/utils'

/**
 * One horizontal bar split into parts, each part's length proportional to its value. Measured parts are filled with
 * the measured hue (deeper first); a stated part (for example a demo fee at the published rate, which no market data
 * checks) is a dashed outline, so the colour keeps meaning "measured". Parts are separated by a 2 px surface gap.
 * A part below zero cannot be stacked honestly: it is left out of the bar and listed with "below zero, not drawn".
 * Every part has a hover tooltip and the legend under the bar repeats each label and value in text.
 */
export interface StackPart { key: string; label: string; value: number; valueLabel: string; stated?: boolean; note?: string }

// The ruler shares of hue.ts: never paler than 65% of the measured colour (the floor the contrast test holds at 3:1).
// A fourth category is drawn as an outline (`stated`), not a paler fill.
const SHARES = [100, 82, 65]

export function stackWidths(parts: StackPart[]): Array<{ key: string; pct: number }> {
  const drawn = parts.filter((p) => p.value > 0)
  const sum = drawn.reduce((a, p) => a + p.value, 0)
  return drawn.map((p) => ({ key: p.key, pct: sum > 0 ? (p.value / sum) * 100 : 0 }))
}

export function StackBar({ parts, className, height = 14, legend = true }: { parts: StackPart[]; className?: string; height?: number; legend?: boolean }) {
  const widths = new Map(stackWidths(parts).map((w) => [w.key, w.pct]))
  let measuredIdx = 0
  const fills = new Map(parts.map((p) => [p.key, p.stated ? null : `color-mix(in srgb, var(--ui-measured) ${SHARES[Math.min(measuredIdx++, SHARES.length - 1)]}%, var(--ui-raised))`]))
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex w-full gap-[2px]" style={{ height }} aria-hidden="true">
        {parts.filter((p) => widths.has(p.key)).map((p) => (
          <Tooltip key={p.key}>
            <TooltipTrigger asChild>
              <span tabIndex={-1} className={cn('block h-full min-w-[3px] first:rounded-l-[4px] last:rounded-r-[4px] transition-[filter] hover:brightness-125', p.stated && 'border border-dashed border-ui-graphite')}
                style={{ width: `${widths.get(p.key)}%`, background: fills.get(p.key) ?? 'transparent' }} />
            </TooltipTrigger>
            <TooltipContent side="top" className="tabular-nums">{p.label}: {p.valueLabel}{p.note ? `, ${p.note}` : ''}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {legend ? (
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-ui-graphite">
                <span aria-hidden="true" className={cn('size-2.5 rounded-[3px]', p.stated && 'border border-dashed border-ui-graphite')} style={{ background: fills.get(p.key) ?? 'transparent' }} />
                {p.label}
              </span>
              <span className="text-right tabular-nums text-ui-ink">{p.valueLabel}{p.value < 0 ? <span className="block text-[11px] text-ui-graphite">below zero, not drawn</span> : null}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
