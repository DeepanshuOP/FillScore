'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '../../../lib/utils'
import { themeToggleView } from './themeToggleView'

/**
 * Paper or Carbon copy (design v3). A worded toggle, underlined like a printed instruction; next-themes knows the theme
 * only after mount, so the label is held at a fixed width until then.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const carbon = resolvedTheme === 'carbon'
  const v = themeToggleView(carbon)
  // A4: a switch (two states) named by what it shows, "Theme: Paper"; aria-checked is true for the Carbon copy
  return (
    <button type="button" role="switch" aria-checked={mounted && v.checked} onClick={() => setTheme(carbon ? 'paper' : 'carbon')} disabled={!mounted}
      title={mounted ? v.title : undefined}
      className={cn('inline-flex h-9 min-w-[10.5rem] items-center justify-center whitespace-nowrap px-1 text-sm font-medium text-ui-graphite underline decoration-ui-edge underline-offset-[0.3em] transition-colors hover:text-ui-ink', className)}>
      {mounted ? v.text : <span aria-hidden="true">&nbsp;</span>}
    </button>
  )
}
