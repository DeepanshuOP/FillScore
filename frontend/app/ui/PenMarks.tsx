import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { bracketPath, circlePath } from './pen'

/**
 * The auditor's pen around inline content (design v3). The stroke is decoration that doubles words already on the page:
 * on paper the pen orange is under 3:1, so whatever it circles is also stated in pen-ink text nearby. Seeded, so the
 * server and the client draw the same loop. The SVG scales with the box; `non-scaling-stroke` keeps the line weight.
 */
export function PenCircle({ children, seed = 1, className }: { children: ReactNode; seed?: number; className?: string }) {
  return (
    <span className={cn('relative inline-block px-1.5', className)}>
      {children}
      <svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-1 -inset-y-1.5 h-[calc(100%+12px)] w-[calc(100%+8px)] overflow-visible">
        <path d={circlePath(6, 6, 88, 28, seed)} fill="none" stroke="var(--ui-pen)" strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  )
}

/** A pen bracket across a share of the box's width (0..1), ticks pointing down; used on the rankings tape. */
export function PenBracket({ from, to, seed = 2, className }: { from: number; to: number; seed?: number; className?: string }) {
  const x0 = Math.max(0, Math.min(1000, from * 1000)), x1 = Math.max(x0 + 6, Math.min(1000, to * 1000))
  return (
    <svg aria-hidden="true" viewBox="0 0 1000 20" preserveAspectRatio="none" className={cn('pointer-events-none block h-5 w-full overflow-visible', className)}>
      <path d={bracketPath(x0, x1, 6, -9, seed)} fill="none" stroke="var(--ui-pen)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
