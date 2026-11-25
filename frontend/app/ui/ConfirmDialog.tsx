'use client'

import { useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { buttonClass } from './buttonClass'

/**
 * A destructive action confirmed in a dialog (design v5, PROPOSAL §3.4): an outlined button opens a dialog that names what will
 * be lost; only its own button acts. Cancel, Escape and a click outside close it without acting. 44 px buttons on phones.
 */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, disabled }: {
  trigger: ReactNode; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void | Promise<void>; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" disabled={disabled} className={buttonClass('destructive', 'md', 'pointer-coarse:h-11')}>{trigger}</button>
      </DialogTrigger>
      <DialogContent data-app className="border border-ui-rule bg-ui-raised text-ui-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-ui-ink">{title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-snug text-ui-graphite">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-ui-rule bg-ui-overlay">
          <button type="button" onClick={() => setOpen(false)} className={buttonClass('secondary', 'md', 'pointer-coarse:h-11')}>Cancel</button>
          <button type="button" onClick={async () => { setOpen(false); await onConfirm() }} className={buttonClass('destructive', 'md', 'pointer-coarse:h-11')}>{confirmLabel}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
