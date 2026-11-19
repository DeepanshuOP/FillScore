import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * A ruled section, not a card: a 1 px rule above, space around, no shadow. `raised` is the one place a surface
 * changes (the headline strip). Heading levels are the caller's choice (`as`), so a page keeps a real outline.
 */
export function Panel({ title, description, actions, children, as: Heading = 'h2', raised = false, className, id }: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  as?: 'h2' | 'h3'
  raised?: boolean
  className?: string
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId}
      className={cn('border-t border-ui-rule pt-6', raised && 'rounded-ui border border-ui-rule bg-ui-raised p-6', className)}>
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="max-w-[68ch]">
          <Heading id={headingId} className="text-[1.25rem] leading-7 font-semibold text-ui-ink">{title}</Heading>
          {description ? <p className="mt-1 text-sm text-ui-graphite">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}
