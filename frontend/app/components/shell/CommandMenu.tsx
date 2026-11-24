'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BookOpen, FileCheck2, Hash, Settings, User, Stamp } from 'lucide-react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@/components/ui/command'
import { DEMO_ACCOUNTS, looksLikeOrderId, SECTIONS, sectionOfPath, viewHref } from './nav'
import { SECTION_ICON as ICON } from './navIcons'

/**
 * ⌘K / Ctrl K: jump to a section (the sidebar's nine, each with its one-line gloss), a demo account, a page, or an order id.
 * Opens plainly: no motion on the palette or its keys (DESIGN §11). Design v5: this module (and cmdk with it) loads on the first
 * open, not with the app frame; the key listener lives in AppFrame (`PaletteHost`).
 */
export default function CommandMenu({ open, onOpenChange, userId, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; signedIn: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const here = sectionOfPath(pathname) ?? 'home'
  const [query, setQuery] = useState('')

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
              <CommandItem key={s.id} value={`section ${s.label} ${s.gloss}`} data-testid={`palette-${s.id}`} onSelect={() => go(viewHref(s.id, userId, signedIn))}>
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
          {userId ? <CommandItem value="page public score card" onSelect={() => go(`/share/${userId}`)}><Stamp aria-hidden="true" /> Public score card</CommandItem> : null}
          <CommandItem value="page methodology" onSelect={() => go('/methodology')}><BookOpen aria-hidden="true" /> Methodology</CommandItem>
          <CommandItem value="page verify a signed report" onSelect={() => go('/verify')}><FileCheck2 aria-hidden="true" /> Verify a signed report</CommandItem>
          {signedIn ? <CommandItem value="page settings" onSelect={() => go('/app/settings')}><Settings aria-hidden="true" /> Settings</CommandItem> : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
