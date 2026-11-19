'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { DURATION, EASE, gsap, prefersReducedMotion } from '../lib/motion'

interface ToastItem { id: number; title: string; detail?: string }
const Ctx = createContext<{ show: (t: Omit<ToastItem, 'id'>) => void } | null>(null)

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast needs a ToastProvider')
  return c
}

function ToastView({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = el.current
    if (node && !prefersReducedMotion()) gsap.fromTo(node, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: DURATION.ui, ease: EASE.out })
    const timer = window.setTimeout(() => onClose(item.id), 6000)
    return () => window.clearTimeout(timer)
  }, [item.id, onClose])
  return (
    <div ref={el} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-ui border border-ui-edge bg-ui-raised p-3 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <Check aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ui-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ui-ink">{item.title}</p>
        {item.detail ? <p className="text-sm text-ui-graphite">{item.detail}</p> : null}
      </div>
      <button type="button" aria-label="Dismiss notice" onClick={() => onClose(item.id)} className="rounded-ui p-1 text-ui-graphite hover:text-ui-ink">
        <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
      </button>
    </div>
  )
}

/** A confirmation of something the user just did, read out politely by assistive technology. Closes itself after 6 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const next = useRef(1)
  const close = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), [])
  const show = useCallback((t: Omit<ToastItem, 'id'>) => setItems((xs) => [...xs, { ...t, id: next.current++ }].slice(-3)), [])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-start sm:pl-6">
        {items.map((i) => <ToastView key={i.id} item={i} onClose={close} />)}
      </div>
    </Ctx.Provider>
  )
}
