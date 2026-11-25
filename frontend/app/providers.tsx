'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'

/**
 * The one provider every page needs (design v5, D3; step 7 moved the others out of the root layout). Light, Dark or System, default
 * System; the choice is kept by next-themes in localStorage (key "fs-theme-v5": the earlier "fs-theme" held "paper" or "carbon", names
 * that no longer exist). Where the others live now: the tooltip provider and the toast mount in `app/app/layout.tsx` (the app is the only
 * place that uses them), the sign-in state in the layouts of the pages that read it, and Motion's `MotionConfig` inside the AI review,
 * the one component that still uses Motion.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange themes={['light', 'dark']} storageKey="fs-theme-v5">
      {children}
    </ThemeProvider>
  )
}
