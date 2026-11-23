'use client'

import type { ComponentProps, ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '../../../lib/utils'

type Props = Omit<ComponentProps<typeof Button>, 'children' | 'aria-label'> & { label: string; icon: ReactNode }

/**
 * A button of the page header (A4, orders of 2026-11-23). From 1024 px (lg) its text label is visible beside the icon; below that
 * it is the icon alone, named by `aria-label` and explained by a tooltip (which is not drawn where the label already shows).
 * Extra props (a sheet trigger's, a click handler) go to the button.
 */
export function HeaderAction({ label, icon, className, ...rest }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="sm" aria-label={label} className={cn('max-sm:min-h-11 max-sm:min-w-11', className)} {...rest}>
          {icon}
          <span className="hidden lg:inline">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="lg:hidden">{label}</TooltipContent>
    </Tooltip>
  )
}
