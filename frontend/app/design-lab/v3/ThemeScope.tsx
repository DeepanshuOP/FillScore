'use client'

import { createContext, useContext, useState } from 'react'
import { cssVars, grid, tape } from './tokens'

type Dir = 'tape' | 'grid'
const THEMES = { tape: { a: ['paper', tape.paper], b: ['carbon', tape.carbon] }, grid: { a: ['ink', grid.ink], b: ['sheet', grid.sheet] } } as const
const Ctx = createContext<{ alt: boolean; toggle: () => void; dir: Dir }>({ alt: false, toggle: () => {}, dir: 'tape' })
export const useScope = () => useContext(Ctx)

/** Applies one direction's tokens as CSS variables; the alternative theme (carbon copy, or the light sheet) is one click. */
export function ThemeScope({ dir, children, alt: initial = false }: { dir: Dir; children: React.ReactNode; alt?: boolean }) {
  const [alt, setAlt] = useState(initial)
  const [name, vars] = alt ? THEMES[dir].b : THEMES[dir].a
  return (
    <Ctx.Provider value={{ alt, toggle: () => setAlt((v) => !v), dir }}>
      <div data-v3={dir} data-theme={name} style={cssVars(vars)}>{children}</div>
    </Ctx.Provider>
  )
}

export function ThemeToggle({ className }: { className?: string }) {
  const { alt, toggle, dir } = useScope()
  const label = dir === 'tape' ? (alt ? 'Paper' : 'Carbon copy') : (alt ? 'Ink' : 'Sheet')
  return <button type="button" className={className} onClick={toggle} aria-label={`Switch to the ${label.toLowerCase()} theme`}>{label}</button>
}
