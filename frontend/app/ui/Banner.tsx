import type { ReactNode } from 'react'
import { Clock, Info, Lock, ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * A notice in the flow of the page. Four kinds, each with its own drawn icon and its own words, so the kind never
 * rests on colour: info, stale (data last synced), refused (a key was rejected), demo (read-only account).
 * A refusal is announced at once (role alert); the others politely (role status). A 1 px frame, no coloured side stripe.
 */
const KINDS = {
  info: { Icon: Info, role: 'status', tone: 'text-ui-measured' },
  stale: { Icon: Clock, role: 'status', tone: 'text-ui-insufficient-text' },
  refused: { Icon: ShieldAlert, role: 'alert', tone: 'text-ui-danger' },
  demo: { Icon: Lock, role: 'status', tone: 'text-ui-graphite' },
} as const

export function Banner({ kind, title, children, action, className }: { kind: keyof typeof KINDS; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { Icon, role, tone } = KINDS[kind]
  return (
    <div role={role} data-kind={kind} className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-ui border border-ui-edge bg-ui-raised p-4', className)}>
      <Icon aria-hidden="true" strokeWidth={1.75} className={cn('mt-0.5 size-5 shrink-0', tone)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ui-ink">{title}</p>
        {children ? <div className="mt-0.5 max-w-[68ch] text-sm text-ui-graphite">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
