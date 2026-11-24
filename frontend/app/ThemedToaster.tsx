'use client'

import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'

/** Toasts as printed slips (design v3): receipt white, Departure Mono, a torn bottom edge (`fs-slip`, app/ui/paper.css). */
export default function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-right"
      gap={18}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'fs-slip flex items-start gap-2.5 [&_svg]:mt-0.5 [&_svg]:size-3.5',
          title: 'text-ui-ink',
          description: 'text-ui-graphite',
          actionButton: 'ml-auto underline underline-offset-[3px]',
          cancelButton: 'text-ui-graphite underline underline-offset-[3px]',
          error: '[&_[data-icon]]:text-ui-danger',
        },
      }}
    />
  )
}
