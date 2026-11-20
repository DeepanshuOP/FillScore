import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Nothing to show yet. Says what is missing and the one next step; no illustration, no cheer. */
export function EmptyState({ title, children, action, className }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[12px] border border-dashed border-ui-rule px-5 py-8 text-center', className)}>
      <h3 className="text-[15px] font-medium text-ui-ink">{title}</h3>
      {children ? <p className="mx-auto mt-1 max-w-[52ch] text-[13px] leading-5 text-ui-graphite">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
