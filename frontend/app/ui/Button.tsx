'use client'

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DURATION, EASE, gsap, prefersReducedMotion } from '../lib/motion'

type Variant = 'primary' | 'secondary' | 'quiet' | 'destructive'

const VARIANT: Record<Variant, string> = {
  // Primary is the ink colour: the measured colour is reserved for measured values, so it never paints a control.
  primary: 'bg-ui-ink text-ui-surface border border-ui-ink hover:opacity-90',
  secondary: 'bg-transparent text-ui-ink border border-ui-edge hover:bg-ui-raised',
  quiet: 'bg-transparent text-ui-ink border border-transparent underline hover:bg-ui-raised',
  destructive: 'bg-transparent text-ui-danger border border-ui-danger hover:bg-ui-raised',
}

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: Variant
  loading?: boolean
  /** Destructive only: the first click arms the button, the second (labelled `confirm.label`) acts. Escape or leaving cancels. */
  confirm?: { label: string; cancelLabel?: string }
  className?: string
}

export function Button({ variant = 'primary', loading = false, confirm, className, children, onClick, disabled, type = 'button', ...rest }: Props) {
  const [armed, setArmed] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const needsConfirm = variant === 'destructive' && !!confirm

  useEffect(() => {
    if (!armed || !cancel.current || prefersReducedMotion()) return
    const tween = gsap.fromTo(cancel.current, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: DURATION.ui, ease: EASE.out })
    return () => { tween.kill() }
  }, [armed])

  const base = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-ui px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const isDisabled = disabled || loading

  if (!needsConfirm) {
    return (
      <button type={type} disabled={isDisabled} aria-busy={loading || undefined} onClick={onClick} className={cn(base, VARIANT[variant], className)} {...rest}>
        {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
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
        className={cn(base, armed ? 'border border-ui-danger bg-ui-danger text-ui-on-danger' : VARIANT.destructive, className)} {...rest}>
        {loading ? <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" /> : null}
        {armed ? confirm!.label : children}
      </button>
      {armed ? (
        <button ref={cancel} type="button" onClick={() => setArmed(false)} className={cn(base, VARIANT.secondary)}>{confirm!.cancelLabel ?? 'Cancel'}</button>
      ) : null}
      <span role="status" className="sr-only">{armed ? `Press again to confirm: ${confirm!.label}` : ''}</span>
    </span>
  )
}
