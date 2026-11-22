'use client'

import Link from 'next/link'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'

/** The phone menu of the marketing header (a Vaul bottom sheet). Loaded only when it is first opened. */
export default function MarketingMenu({ open, onOpenChange, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; signedIn: boolean }) {
  const links = [['/methodology', 'Methodology'], ['/verify', 'Verify a pack'], ['/app/check', 'Check a broker file'], ...(signedIn ? [] : [['/login', 'Log in']])]
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-ui-raised">
        <DrawerTitle className="sr-only">Menu</DrawerTitle>
        <nav aria-label="Site menu" className="flex flex-col gap-1 px-4 pt-2 pb-8">
          {links.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => onOpenChange(false)} className="flex h-11 items-center rounded-[9px] px-3 text-[15px] text-ui-ink no-underline hover:bg-ui-overlay">{label}</Link>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  )
}
