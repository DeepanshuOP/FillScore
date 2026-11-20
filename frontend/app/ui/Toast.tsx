'use client'

import type { ReactNode } from 'react'
import { toast } from 'sonner'

/**
 * Design v2: toasts are Sonner's (one <Toaster> in app/providers.tsx). The API the screens call is unchanged:
 * `useToast().show({ title, detail })`. ToastProvider stays as a pass-through so older trees still render.
 */
export function useToast() {
  return {
    show: ({ title, detail }: { title: string; detail?: string }) => { toast(title, detail ? { description: detail } : undefined) },
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
