'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { THEME_CHOICES, themeChoice, themeLabel, type ThemeChoice } from './themeToggleView'

const ICON = { light: Sun, dark: Moon, system: Monitor } as const

/**
 * Light, Dark or System (design v5, D3). A button with the current choice's icon and word; its menu lists the three.
 * next-themes knows the choice only after mount, so until then the button holds its width and shows System, the default.
 */
export function ThemeToggle({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id) }, [])
  const choice: ThemeChoice = mounted ? themeChoice(theme) : 'system'
  const Icon = ICON[choice]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="theme-toggle" aria-label={`Theme: ${themeLabel(choice)}`}
          className={cn('inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ui-graphite transition-colors hover:bg-ui-overlay hover:text-ui-ink pointer-coarse:min-h-11', className)}>
          <Icon aria-hidden="true" className="size-4" />
          {iconOnly ? null : <span>{themeLabel(choice)}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" data-app className="min-w-36">
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setTheme(v)}>
          {THEME_CHOICES.map((c) => {
            const I = ICON[c.value]
            return (
              <DropdownMenuRadioItem key={c.value} value={c.value} className="min-h-9 text-sm pointer-coarse:min-h-11">
                <I aria-hidden="true" className="size-4" /> {c.label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
