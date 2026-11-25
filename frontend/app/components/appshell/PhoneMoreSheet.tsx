'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'

/**
 * The phone's More sheet (a Vaul drawer). It lives in its own file so that Vaul (about 10 kB compressed) is not in the app's first load:
 * AppFrame loads this file the first time More is pressed (design v5 step 7). The contents are passed in, so this file imports nothing
 * from AppFrame.
 */
export default function PhoneMoreSheet({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-app className="bg-ui-surface text-ui-ink">
        <DrawerTitle className="sr-only">More</DrawerTitle>
        <DrawerDescription className="sr-only">The other sections of the app, the theme and the account</DrawerDescription>
        <div className="max-h-[80dvh] overflow-y-auto px-4 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[16px] font-semibold">More</p>
            <DrawerClose asChild><button type="button" aria-label="Close" className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-ui-overlay"><X aria-hidden="true" className="size-5" /></button></DrawerClose>
          </div>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
