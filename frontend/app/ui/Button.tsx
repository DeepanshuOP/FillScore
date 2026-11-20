'use client'

import { useRef, useState, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { cn } from '../../lib/utils'

import { BASE, buttonClass, SIZE, VARIANT, type Size, type Variant } from './buttonClass'

export { buttonClass }

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Destructive only: the first click arms the button, the second (labelled `confirm.label`) acts. Escape or leaving cancels. */
  confirm?: { label: string; cancelLabel?: string }
  className?: string
}


export function Button({ variant = 'primary', size = 'md', loading = false, confirm, className, children, onClick, disabled, type = 'button', ...rest }: Props) {
  const [armed, setArmed] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const needsConfirm = variant === 'destructive' && !!confirm
  const isDisabled = disabled || loading

  if (!needsConfirm) {
    return (
      <button type={type} disabled={isDisabled} aria-busy={loading || undefined} onClick={onClick} className={buttonClass(variant, size, className)} {...rest}>
        {loading ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
        {children}
      </button>
    )
  }

  return (
    <span ref={wrap} className="inline-flex items-center gap-2"
      onBlur={(e) => { if (armed && !wrap.current?.contains(e.relatedTarget as Node | null)) setArmed(false) }}
      onKeyDown={(e) => { if (e.key === 'Escape') setArmed(false) }}>
      <button type={type} disabled={isDisabled} aria-busy={loading || undefined}
        onClick={(e) => { if (!armed) { setArmed(true); return } setArmed(false); onClick?.(e) }}
        className={cn(BASE, SIZE[size], armed ? 'bg-ui-danger text-ui-on-danger' : VARIANT.destructive, className)} {...rest}>
        {loading ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
        {armed ? confirm!.label : children}
      </button>
      <AnimatePresence initial={false}>
        {armed ? (
          <m.button key="cancel" type="button" onClick={() => setArmed(false)} className={buttonClass('secondary', size)}
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            {confirm!.cancelLabel ?? 'Cancel'}
          </m.button>
        ) : null}
      </AnimatePresence>
      <span role="status" className="sr-only">{armed ? `Press again to confirm: ${confirm!.label}` : ''}</span>
    </span>
  )
}
