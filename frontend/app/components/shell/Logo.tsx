import { cn } from '../../../lib/utils'

/** The FillScore wordmark (design v3): Cabinet Grotesk Black with the fill-orange dot, the pen's one permanent mark. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-px text-ui-ink', className)}>
      {compact ? (
        <><span aria-hidden="true" className="text-[22px] font-black leading-none tracking-[-0.04em]">F</span><span className="sr-only">FillScore</span></>
      ) : (
        <span className="text-[22px] font-black leading-none tracking-[-0.035em]">FillScore</span>
      )}
      <i aria-hidden="true" className="inline-block size-[7px] -translate-y-px rounded-full bg-ui-pen" />
    </span>
  )
}
