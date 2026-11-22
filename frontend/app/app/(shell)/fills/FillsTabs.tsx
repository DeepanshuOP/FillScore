'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '../../../../lib/utils'

/** The two views of Fills (IA v4: today's Trades and Analytics): Ledger and Patterns. The tab is in the address (`?tab=patterns`), so a
 *  link, a reload and the back button keep it. No motion on a tab change (DESIGN §11). */
export function FillsTabs({ active }: { active: 'ledger' | 'patterns' }) {
  const sp = useSearchParams()
  const href = (tab: 'ledger' | 'patterns') => {
    const p = new URLSearchParams(sp.toString())
    if (tab === 'ledger') p.delete('tab'); else p.set('tab', tab)
    const q = p.toString()
    return q ? `/app/fills?${q}` : '/app/fills'
  }
  return (
    <nav aria-label="Fills views" className="mb-6 flex gap-1 border-b border-ui-rule" data-testid="fills-tabs">
      {([['ledger', 'Ledger'], ['patterns', 'Patterns']] as const).map(([id, label]) => (
        <Link key={id} href={href(id)} scroll={false} aria-current={active === id ? 'page' : undefined}
          className={cn('relative min-h-11 px-4 py-2.5 text-[15px] no-underline', active === id
            ? 'font-bold text-ui-ink after:absolute after:inset-x-4 after:-bottom-px after:h-[3px] after:border-y after:border-ui-ink'
            : 'font-medium text-ui-graphite hover:text-ui-ink')}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
