import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Design v3: a section of the app, laid out as a ledger block on the paper: one ink rule above, the title as a real
 * heading (`as`) in Cabinet Grotesk, a one-line caption. No card, no radius, no shadow. `flat` drops the rule for a
 * section that sits inside another one.
 */
export function Panel({ title, description, actions, children, as: Heading = 'h2', flat = false, className, id, bodyClassName }: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  as?: 'h2' | 'h3'
  /** @deprecated kept for older call sites. */
  raised?: boolean
  flat?: boolean
  className?: string
  bodyClassName?: string
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cn(flat ? '' : 'panel pt-4 pb-2', 'min-w-0', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-[68ch]">
          <Heading id={headingId} className="text-[1.25rem] font-bold leading-7 tracking-[-0.02em] text-ui-ink">{title}</Heading>
          {description ? <p className="mt-0.5 text-sm leading-5 text-ui-graphite">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
