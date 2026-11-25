'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../../lib/utils'
import { DOCS } from './docsList'

/** The docs shell's left list (design v5): the active document has a filled background and `aria-current`; 44 px rows on phones. */
export function DocsNav() {
  const path = usePathname()
  const items = [{ href: '/docs', title: 'Overview' }, ...DOCS.map((d) => ({ href: d.href, title: d.title }))]
  return (
    <nav aria-label="Docs" className="lg:sticky lg:top-24 lg:self-start">
      <p className="text-[14px] font-semibold text-ui-ink">Docs</p>
      <ul className="mt-2 flex flex-wrap gap-1 lg:flex-col">
        {items.map((d) => {
          const active = path === d.href
          return (
            <li key={d.href}>
              <Link href={d.href} aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-10 items-center rounded-lg px-3 text-[14px] font-medium no-underline transition-colors pointer-coarse:min-h-11',
                  active ? 'bg-ui-overlay text-ui-ink' : 'text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink')}>{d.title}</Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
