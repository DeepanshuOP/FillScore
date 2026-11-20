'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '../../../lib/utils'

/**
 * Paper or Carbon copy (design v3). A worded toggle, underlined like a printed instruction; next-themes knows the theme
 * only after mount, so the label is held at a fixed width until then.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const carbon = resolvedTheme === 'carbon'
  return (
    <button type="button" onClick={() => setTheme(carbon ? 'paper' : 'carbon')} disabled={!mounted}
      title={carbon ? 'Paper theme' : 'Carbon copy theme: warm charcoal, the same orange'}
      className={cn('inline-flex h-9 min-w-[6.5rem] items-center justify-center whitespace-nowrap px-1 text-sm font-medium text-ui-graphite underline decoration-ui-edge underline-offset-[0.3em] transition-colors hover:text-ui-ink', className)}>
      {mounted ? (carbon ? 'Paper' : 'Carbon copy') : <span aria-hidden="true">&nbsp;</span>}
    </button>
  )
}
