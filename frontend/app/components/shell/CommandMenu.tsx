'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, BookOpen, FileCheck2, Hash, Home, LayoutGrid, ListOrdered, Settings, ShieldCheck, Sparkles, Table2, Trophy, User, Stamp, FileSearch } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { DEMO_ACCOUNTS, looksLikeOrderId, SECTIONS, sectionOfPath, viewHref, type SectionId } from './nav'

const ICON: Record<SectionId, typeof LayoutGrid> = {
  home: Home, overview: LayoutGrid, orders: ListOrdered, rules: ShieldCheck, rankings: Trophy, council: Sparkles, evidence: FileCheck2, fills: Table2, check: FileSearch,
}

/**
 * ⌘K / Ctrl K: jump to a section (the sidebar's nine, each with its one-line gloss), a demo account, a page, or an order id.
 * Opens plainly: no motion on the palette or its keys (DESIGN §11).
 */
export function CommandMenu({ open, onOpenChange, userId, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; signedIn: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const here = sectionOfPath(pathname) ?? 'home'
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onOpenChange(!open) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (href: string) => { onOpenChange(false); setQuery(''); router.push(href) }
  const orderId = query.trim()

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Find a section, an account, a page or an order id." className="sm:max-w-lg">
      <CommandInput placeholder="Jump to a section, an account or an order id" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>Nothing matched.</CommandEmpty>
        {looksLikeOrderId(orderId) ? (
          <CommandGroup heading="Order">
            <CommandItem value={`order ${orderId}`} onSelect={() => go(viewHref('orders', userId, signedIn, { order: orderId }))}>
              <Hash aria-hidden="true" /> Open order <code className="font-ui-mono text-[12px]">{orderId}</code>
            </CommandItem>
          </CommandGroup>
        ) : null}
        <CommandGroup heading="Sections">
          {SECTIONS.map((s) => {
            const Icon = ICON[s.id]
            return (
              <CommandItem key={s.id} value={`section ${s.label} ${s.gloss}`} onSelect={() => go(viewHref(s.id, userId, signedIn))}>
                <Icon aria-hidden="true" /> <span>{s.label}</span><CommandShortcut className="max-w-[60%] truncate tracking-normal normal-case">{s.gloss}</CommandShortcut>
              </CommandItem>
            )
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Accounts">
          {DEMO_ACCOUNTS.map((a) => (
            <CommandItem key={a.id} value={`account ${a.label} ${a.id}`} onSelect={() => go(viewHref(here, a.id, signedIn))}>
              <User aria-hidden="true" /> {a.label}<CommandShortcut>synthetic</CommandShortcut>
            </CommandItem>
          ))}
          {signedIn ? <CommandItem value="account your account" onSelect={() => go(viewHref(here, null, true))}><User aria-hidden="true" /> Your account</CommandItem> : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          <CommandItem value="page fills patterns" onSelect={() => go(viewHref('fills', userId, signedIn, { tab: 'patterns' }))}><Activity aria-hidden="true" /> Fills: patterns</CommandItem>
          {userId ? <CommandItem value="page public score card" onSelect={() => go(`/share/${userId}`)}><Stamp aria-hidden="true" /> Public score card</CommandItem> : null}
          <CommandItem value="page methodology" onSelect={() => go('/methodology')}><BookOpen aria-hidden="true" /> Methodology</CommandItem>
          <CommandItem value="page verify an evidence pack" onSelect={() => go('/verify')}><FileCheck2 aria-hidden="true" /> Verify an evidence pack</CommandItem>
          {signedIn ? <CommandItem value="page settings" onSelect={() => go('/app/settings')}><Settings aria-hidden="true" /> Settings</CommandItem> : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
