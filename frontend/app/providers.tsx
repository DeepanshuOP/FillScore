'use client'

import type { ReactNode } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!bg-ui-overlay !text-ui-ink !border-ui-rule !rounded-[12px] !shadow-ui-float !font-ui',
          description: '!text-ui-graphite',
        },
      }}
    />
  )
}

/**
 * App-wide providers (design v2). Dark is the default theme; the choice is kept by next-themes in localStorage.
 * MotionConfig reducedMotion="user": with the OS setting on, Motion drops transform and layout animation.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} disableTransitionOnChange themes={['dark', 'light']}>
      {/* LazyMotion + the `m` components keep Motion's share of every page small (domAnimation: animate, exit, in-view). */}
      <LazyMotion features={domAnimation}>
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
