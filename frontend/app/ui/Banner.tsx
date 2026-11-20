import type { ReactNode } from 'react'
import { Clock, Info, Lock, ShieldAlert } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * A notice in the flow of the page, printed as a slip on the paper (design v3). Four kinds, each with its own drawn icon
 * and its own words, so the kind never rests on colour: info, stale (data last synced), refused (a key was rejected;
 * a returned slip with a danger rule), demo (read-only account). A refusal is announced at once (role alert); the
 * others politely (role status). No coloured side stripe.
 */
const KINDS = {
  info: { Icon: Info, role: 'status', tone: 'text-ui-ink' },
  stale: { Icon: Clock, role: 'status', tone: 'text-ui-insufficient-text' },
  refused: { Icon: ShieldAlert, role: 'alert', tone: 'text-ui-danger' },
  demo: { Icon: Lock, role: 'status', tone: 'text-ui-graphite' },
} as const

export function Banner({ kind, title, children, action, className }: { kind: keyof typeof KINDS; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const { Icon, role, tone } = KINDS[kind]
  return (
    <div role={role} data-kind={kind}
      className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 bg-ui-raised p-4 shadow-ui', kind === 'refused' && 'outline-2 -outline-offset-2 outline-dashed outline-[color-mix(in_srgb,var(--ui-danger)_60%,transparent)]', className)}>
      <Icon aria-hidden="true" strokeWidth={1.75} className={cn('mt-0.5 size-4 shrink-0', tone)} />
      <div className="min-w-[min(100%,15rem)] flex-1">
        <p className="text-[15px] font-bold text-ui-ink">{title}</p>
        {children ? <div className="mt-0.5 max-w-[68ch] text-sm leading-5 text-ui-graphite">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}
