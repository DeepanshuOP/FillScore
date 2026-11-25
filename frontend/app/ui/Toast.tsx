'use client'

import dynamic from 'next/dynamic'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * Toasts are Sonner's. Design v5 step 7: neither Sonner nor its Toaster is in a page's first load. `useToast().show` loads Sonner when
 * the first toast is shown, and `ToastProvider` mounts the Toaster at the same moment (a toast created before the Toaster mounts is kept
 * by Sonner and shown on mount). The API the screens call is unchanged: `useToast().show({ title, detail })`.
 */
const ThemedToaster = dynamic(() => import('../ThemedToaster'), { ssr: false })
const ArmContext = createContext<() => void>(() => {})

export function useToast() {
  const arm = useContext(ArmContext)
  const show = useCallback(({ title, detail }: { title: string; detail?: string }) => {
    arm()
    void import('sonner').then(({ toast }) => { toast(title, detail ? { description: detail } : undefined) })
  }, [arm])
  return useMemo(() => ({ show }), [show])
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [armed, setArmed] = useState(false)
  const arm = useCallback(() => setArmed(true), [])
  return (
    <ArmContext.Provider value={arm}>
      {children}
      {armed ? <ThemedToaster /> : null}
    </ArmContext.Provider>
  )
}
