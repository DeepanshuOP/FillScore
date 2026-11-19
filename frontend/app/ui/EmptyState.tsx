import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Nothing to show yet. Says what is missing and the one next step; no illustration, no cheer. */
export function EmptyState({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('border-t border-ui-rule py-8', className)}>
      <h3 className="text-[1rem] font-semibold text-ui-ink">{title}</h3>
      {children ? <p className="mt-1 max-w-[56ch] text-sm text-ui-graphite">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
