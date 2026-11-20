'use client'

import { useTheme } from 'next-themes'
import { Toaster } from 'sonner'

export default function ThemedToaster() {
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
