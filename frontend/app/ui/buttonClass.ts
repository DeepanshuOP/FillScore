import { cn } from '../../lib/utils'

/** Button styles (design v2), usable from server and client code alike (a Link styled as a button, for example). */
export type Variant = 'primary' | 'secondary' | 'quiet' | 'destructive'
export type Size = 'sm' | 'md' | 'lg'

/** Primary is the action blue (the measured cyan never paints a control); secondary is a raised overlay. */
export const VARIANT: Record<Variant, string> = {
  primary: 'bg-ui-action text-ui-on-action shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:brightness-110 active:brightness-95',
  secondary: 'bg-ui-overlay text-ui-ink ring-1 ring-inset ring-ui-rule hover:ring-ui-edge hover:bg-[color-mix(in_srgb,var(--ui-overlay),var(--ui-ink)_4%)]',
  quiet: 'bg-transparent text-ui-graphite hover:text-ui-ink hover:bg-ui-overlay',
  destructive: 'bg-transparent text-ui-danger ring-1 ring-inset ring-[color-mix(in_srgb,var(--ui-danger)_55%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-danger)_10%,transparent)]',
}
export const SIZE: Record<Size, string> = { sm: 'h-8 px-3 text-[13px] gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-5 text-[15px] gap-2' }
export const BASE = 'inline-flex shrink-0 items-center justify-center rounded-[9px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow,filter] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4'

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cn(BASE, SIZE[size], VARIANT[variant], className)
}
