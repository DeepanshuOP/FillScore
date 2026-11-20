'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from 'next-themes'
import dynamic from 'next/dynamic'
import { LazyMotion, MotionConfig } from 'motion/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Sonner and Motion's features load after first paint (neither is needed to render a page); a toast fired before the
// Toaster mounts is kept by Sonner and shown on mount.
const ThemedToaster = dynamic(() => import('./ThemedToaster'), { ssr: false })
const loadFeatures = () => import('./motionFeatures').then((m) => m.default)

/**
 * App-wide providers (design v2). Dark is the default theme; the choice is kept by next-themes in localStorage.
 * MotionConfig reducedMotion="user": with the OS setting on, Motion drops transform and layout animation.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange themes={['dark', 'light']}>
      {/* LazyMotion + the `m` components keep Motion's share of every page small (domAnimation: animate, exit, in-view). */}
      <LazyMotion features={loadFeatures}>
        <MotionConfig reducedMotion="user">
          <TooltipProvider delayDuration={200}>
            {children}
            <ThemedToaster />
          </TooltipProvider>
        </MotionConfig>
      </LazyMotion>
    </ThemeProvider>
  )
}
