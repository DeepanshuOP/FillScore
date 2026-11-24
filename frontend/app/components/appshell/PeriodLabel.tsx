'use client'

import { CalendarDays } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** The tooltip of the disabled period control (design v5 order: the period picker is the next order). */
export const PERIOD_TOOLTIP = 'Period choice comes next'

/**
 * The period a page covers, shown as a static label styled like the future picker (PROPOSAL §3.2): a calendar icon and the period in
 * words, disabled, with the tooltip "Period choice comes next". It is a focusable button with aria-disabled, so a keyboard user
 * reaches the tooltip too. It changes nothing: the server answers for the whole history only (decision D6).
 */
export function PeriodLabel({ period }: { period: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-disabled="true" data-testid="header-period"
          className="inline-flex min-h-9 cursor-default items-center gap-2 rounded-lg border border-ui-rule bg-ui-raised px-3 text-sm font-medium text-ui-graphite pointer-coarse:min-h-11">
          <CalendarDays aria-hidden="true" className="size-4" />
          <span><span className="sr-only">Period: </span>{period}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{PERIOD_TOOLTIP}</TooltipContent>
    </Tooltip>
  )
}
