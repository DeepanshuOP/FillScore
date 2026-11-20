import { cn } from '../../lib/utils'

/** Share of the grade colour in the chip's ground (the rest is the sheet). Design v3: 0. The chip is a small rubber
 *  stamp, letter and double border in pen-ink on the bare sheet. The contrast test reads it. */
export const CHIP_TINT = 0

const GRADES = new Set(['A', 'B', 'C', 'D', 'F'])
const SIZE = {
  sm: 'size-7 rounded-[5px] text-[0.875rem] border-[1.5px]',
  md: 'size-10 rounded-[6px] text-xl border-2',
  lg: 'size-14 rounded-[8px] text-[2rem] border-[2.5px]',
  xl: 'size-20 rounded-[10px] text-[3rem] border-[3px]',
} as const

/**
 * A grade letter as a small rubber stamp (design v3): the letter in pen-ink, a border of the same ink, a slight tilt.
 * Every grade is stamped in the same ink: the stamp is the auditor's mark, never a good/bad colour. The letter is the
 * served grade, never computed here.
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
      className={cn('inline-grid shrink-0 -rotate-3 place-items-center border-current font-black leading-none tracking-[-0.04em]', SIZE[size], className)}
      style={{ color: colour, background: CHIP_TINT ? `color-mix(in srgb, ${colour} ${CHIP_TINT}%, var(--ui-raised))` : 'transparent' }}
    >
      {grade}
    </span>
  )
}
