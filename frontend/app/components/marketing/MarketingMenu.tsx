'use client'

import Link from 'next/link'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { buttonClass } from '../../ui/buttonClass'
import { DEMO_ENTRY, SITE_ITEMS } from './siteItems'

/**
 * The phone menu of the marketing bar (a Vaul sheet on receipt paper, torn at the top): the four items, and the account actions
 * pinned at the bottom (cal.com's pattern). Loaded only when it is first opened. Escape closes it and returns focus to Menu.
 */
export default function MarketingMenu({ open, onOpenChange, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; signedIn: boolean }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-ui-raised">
        <div className="fs-torn-top" aria-hidden="true" />
        <DrawerTitle className="sr-only">Menu</DrawerTitle>
        <DrawerDescription className="sr-only">The pages of the FillScore site, and the account actions</DrawerDescription>
        <div className="flex min-h-[50dvh] flex-col px-[var(--ui-gutter)] pt-3 pb-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">MENU</p>
            <DrawerClose asChild><button type="button" className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2">Close</button></DrawerClose>
          </div>
          <nav aria-label="Site menu" className="mt-1 flex flex-col">
            {SITE_ITEMS.map(([href, label]) => (
              <Link key={href} href={href} onClick={() => onOpenChange(false)} className="block py-2.5 text-[20px] font-bold text-ui-ink no-underline">{label}</Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            {signedIn ? (
              <Link href="/app" onClick={() => onOpenChange(false)} className={buttonClass('primary', 'md', 'no-underline justify-center')}>Open the app</Link>
            ) : (
              <>
                <Link href={DEMO_ENTRY} onClick={() => onOpenChange(false)} className={buttonClass('primary', 'md', 'no-underline justify-center')}>Try the demo</Link>
                <Link href="/login" onClick={() => onOpenChange(false)} className={buttonClass('secondary', 'md', 'no-underline justify-center')}>Log in</Link>
                <Link href="/signup" onClick={() => onOpenChange(false)} className="py-2 text-center text-[15px] text-ui-ink">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
