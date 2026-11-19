import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * A label and the thing it labels. The value is always a ValueState (passed as `children`), so a figure can never
 * appear without saying whether it was measured, and a missing figure can never appear as a zero. The label is a
 * term, the value is its definition: the markup is a description list item.
 */
export function StatBlock({ label, children, note, className }: { label: string; children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <dt className="text-sm text-ui-graphite">{label}</dt>
      <dd>{children}</dd>
      {note ? <dd className="max-w-[44ch] text-sm text-ui-graphite">{note}</dd> : null}
    </div>
  )
}

/** A set of StatBlocks. */
export function StatList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn('grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4', className)}>{children}</dl>
}
