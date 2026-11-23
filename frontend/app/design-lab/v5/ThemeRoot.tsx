'use client'
import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'

/**
 * Light / Dark / System for the v5 prototype (PROPOSAL §1: "Paper" and "Carbon copy" become Light and Dark). Stored under
 * `fs-v5-theme`; without it the production key `fs-theme` is read (carbon = dark, paper = light) so the audit script's theme
 * setting applies here too; otherwise the system preference.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'
const Ctx = createContext<{ choice: ThemeChoice; resolved: 'light' | 'dark'; set: (c: ThemeChoice) => void }>({ choice: 'system', resolved: 'light', set: () => undefined })
export const useV5Theme = () => useContext(Ctx)
const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect

function initial(): ThemeChoice {
  const v = localStorage.getItem('fs-v5-theme')
  if (v === 'light' || v === 'dark' || v === 'system') return v
  const old = localStorage.getItem('fs-theme')
  return old === 'carbon' ? 'dark' : old === 'paper' ? 'light' : 'system'
}

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const [sysDark, setSysDark] = useState(false)
  useIso(() => {
    setChoice(initial())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSysDark(mq.matches)
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const resolved = choice === 'system' ? (sysDark ? 'dark' : 'light') : choice
  const set = (c: ThemeChoice) => { localStorage.setItem('fs-v5-theme', c); setChoice(c) }
  return (
    <Ctx.Provider value={{ choice, resolved, set }}>
      <div data-v5 data-theme={resolved} className="min-h-dvh">{children}</div>
    </Ctx.Provider>
  )
}
