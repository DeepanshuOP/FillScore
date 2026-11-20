import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Design v2: a panel of the app (raised ground, hairline, one-pixel top highlight). The title is a real heading
 * (`as`), the caption one line; explanation belongs in a HoverCard or the Method sheet, not here. `flat` drops the
 * panel ground for a section that sits directly on the page.
 */
export function Panel({ title, description, actions, children, as: Heading = 'h2', flat = false, className, id, bodyClassName }: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  as?: 'h2' | 'h3'
  /** @deprecated kept for older call sites; every panel is raised now. */
  raised?: boolean
  flat?: boolean
  className?: string
  bodyClassName?: string
  id?: string
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cn(flat ? '' : 'panel p-5 sm:p-6', 'min-w-0', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-[68ch]">
          <Heading id={headingId} className="text-[15px] font-semibold leading-6 tracking-[-0.01em] text-ui-ink">{title}</Heading>
          {description ? <p className="mt-0.5 text-[13px] leading-5 text-ui-graphite">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
