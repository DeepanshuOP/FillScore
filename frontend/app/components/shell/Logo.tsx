import { cn } from '../../../lib/utils'

/** The FillScore mark: a quote band with one fill on it (the tape, reduced to a glyph), and the wordmark. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-ui-ink', className)}>
      <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--ui-overlay)" stroke="var(--ui-rule)" />
        <path d="M5 14.5 H9 V11 H13 V12.5 H19" fill="none" stroke="var(--ui-measured)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="12" y="9.5" width="4" height="4" rx="1" transform="rotate(45 14 11.5)" fill="var(--ui-action)" />
      </svg>
      {compact ? <span className="sr-only">FillScore</span> : <span className="text-[15px] font-semibold tracking-[-0.02em]">FillScore</span>}
    </span>
  )
}
