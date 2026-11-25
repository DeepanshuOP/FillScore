import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Nothing to show yet (design v5, PROPOSAL §3.3): an optional icon, a 16 px title, one or two 14 px sentences and at most one primary
 * action. It says what is missing and the one next step; no illustration, no cheer.
 */
export function EmptyState({ title, children, action, icon, className }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-xl border border-dashed border-ui-rule px-5 py-8 text-center', className)}>
      {icon ? <span aria-hidden="true" className="mb-3 grid size-10 place-items-center rounded-full bg-ui-overlay text-ui-graphite [&_svg]:size-5">{icon}</span> : null}
      <h3 className="text-[16px] font-semibold text-ui-ink">{title}</h3>
      {children ? <p className="mx-auto mt-1 max-w-[52ch] text-[14px] leading-snug text-ui-graphite">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
