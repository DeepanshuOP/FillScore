import { cn } from '../../lib/utils'

/** Share of the grade colour in the chip's ground (the rest is the panel). The contrast test reads it. */
export const CHIP_TINT = 14

const GRADES = new Set(['A', 'B', 'C', 'D', 'F'])
const SIZE = {
  sm: 'size-7 rounded-[7px] text-[0.8125rem]',
  md: 'size-10 rounded-[9px] text-lg',
  lg: 'size-14 rounded-[12px] text-[1.75rem]',
  xl: 'size-20 rounded-[16px] text-[2.75rem]',
} as const

/**
 * A grade letter on a desaturated chip: the letter in the grade's strong colour, the ground a 14% tint of it, a hairline
 * of the same hue. The letter is the one place a verdict is allowed; money is never coloured good or bad.
 */
export function GradeChip({ grade, size = 'md', className, label }: { grade: string; size?: keyof typeof SIZE; className?: string; label?: string }) {
  const g = GRADES.has(grade) ? grade.toLowerCase() : null
  const colour = g ? `var(--ui-grade-${g})` : 'var(--ui-graphite)'
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-grade={grade}
      className={cn('inline-grid shrink-0 place-items-center font-semibold leading-none tracking-[-0.03em]', SIZE[size], className)}
      style={{
        color: colour,
        background: `color-mix(in srgb, ${colour} ${CHIP_TINT}%, var(--ui-raised))`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colour} 32%, transparent)`,
      }}
    >
      {grade}
    </span>
  )
}
