import { cn } from '../../lib/utils'

/** Button styles (design v3 "Tape & Receipt"), usable from server and client code alike (a Link styled as a button). */
export type Variant = 'primary' | 'secondary' | 'quiet' | 'destructive'
export type Size = 'sm' | 'md' | 'lg'

/**
 * Primary is an ink pill (ink fill, paper text); secondary is an outlined pill on the paper; quiet is an underlined
 * word, like a printed instruction; destructive is outlined in the danger ink. The pen orange never paints a control.
 */
export const VARIANT: Record<Variant, string> = {
  primary: 'bg-ui-action text-ui-on-action border border-ui-action hover:bg-[color-mix(in_srgb,var(--ui-action),var(--ui-surface)_14%)]',
  secondary: 'bg-transparent text-ui-ink border border-ui-edge hover:border-ui-ink hover:bg-ui-overlay',
  quiet: 'bg-transparent text-ui-graphite underline decoration-ui-edge underline-offset-[0.3em] hover:text-ui-ink hover:decoration-ui-ink !px-1',
  destructive: 'bg-transparent text-ui-danger border border-[color-mix(in_srgb,var(--ui-danger)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-danger)_8%,transparent)]',
}
export const SIZE: Record<Size, string> = { sm: 'h-8 px-3.5 text-[13px] gap-1.5', md: 'h-10 px-5 text-[15px] gap-2', lg: 'h-12 px-6 text-base gap-2.5' }
export const BASE = 'inline-flex shrink-0 items-center justify-center rounded-full font-bold whitespace-nowrap transition-[background-color,color,border-color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 [&_svg]:size-4'

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(BASE, SIZE[size], VARIANT[variant], className)
}
