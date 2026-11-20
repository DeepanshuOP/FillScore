'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, FileCheck2, Hash, LayoutGrid, ListOrdered, Settings, ShieldCheck, Sparkles, Trophy, User, Activity, Table2 } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { DEMO_ACCOUNTS, looksLikeOrderId, VIEW_LABEL, VIEWS, viewHref, type View } from './nav'

const VIEW_ICON: Record<View, typeof LayoutGrid> = { overview: LayoutGrid, orders: ListOrdered, rules: ShieldCheck, rankings: Trophy, council: Sparkles, evidence: FileCheck2 }

/** ⌘K / Ctrl K: jump to a demo account, a section, a page, or an order id. */
export function CommandMenu({ open, onOpenChange, userId, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; signedIn: boolean }) {
  const router = useRouter()
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
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Jump to" description="Find an account, a section, a page or an order id." className="sm:max-w-lg">
      <CommandInput placeholder="Jump to an account, a section or an order id" value={query} onValueChange={setQuery} />
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
          {VIEWS.map((v) => {
            const Icon = VIEW_ICON[v]
            return <CommandItem key={v} value={`section ${VIEW_LABEL[v]}`} onSelect={() => go(viewHref(v, userId, signedIn))}><Icon aria-hidden="true" /> {VIEW_LABEL[v]}</CommandItem>
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Accounts">
          {DEMO_ACCOUNTS.map((a) => (
            <CommandItem key={a.id} value={`account ${a.label} ${a.id}`} onSelect={() => go(viewHref('overview', a.id, signedIn))}>
              <User aria-hidden="true" /> {a.label}<CommandShortcut>synthetic</CommandShortcut>
            </CommandItem>
          ))}
          {signedIn ? <CommandItem value="account your account" onSelect={() => go('/dashboard')}><User aria-hidden="true" /> Your account</CommandItem> : null}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Pages">
          <CommandItem value="page trades" onSelect={() => go(userId ? `/trades?userId=${userId}${signedIn ? '&sample=1' : ''}` : '/trades')}><Table2 aria-hidden="true" /> Trades</CommandItem>
          <CommandItem value="page analytics" onSelect={() => go(userId ? `/analytics?userId=${userId}${signedIn ? '&sample=1' : ''}` : '/analytics')}><Activity aria-hidden="true" /> Analytics</CommandItem>
          <CommandItem value="page methodology" onSelect={() => go('/methodology')}><BookOpen aria-hidden="true" /> Methodology</CommandItem>
          <CommandItem value="page verify an evidence pack" onSelect={() => go('/verify')}><FileCheck2 aria-hidden="true" /> Verify an evidence pack</CommandItem>
          {signedIn ? <CommandItem value="page settings" onSelect={() => go('/settings')}><Settings aria-hidden="true" /> Settings</CommandItem> : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
