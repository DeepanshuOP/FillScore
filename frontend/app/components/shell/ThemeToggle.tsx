'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '../../../lib/utils'

/** Dark or light. next-themes knows the theme only after mount, so the button renders a fixed-size placeholder first. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const dark = resolvedTheme !== 'light'
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} disabled={!mounted}
      aria-label="Dark theme" aria-pressed={mounted ? dark : undefined}
      className={cn('grid size-9 place-items-center rounded-[9px] text-ui-graphite transition-colors hover:bg-ui-overlay hover:text-ui-ink', className)}>
      {mounted ? (dark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />) : <span className="size-4" />}
    </button>
  )
}
