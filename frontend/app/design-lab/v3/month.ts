'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { orders, term, type MonthOrder } from './data'

const START = Date.UTC(2024, 0, 1)
const END = Date.UTC(2024, 1, 1)

export interface Tick { o: MonthOrder; x: number; h: number; usd: number | null; measured: boolean }

/** One tick per order on a January time axis; height grows with the square root of the order's measured total in USD. */
export function useMonthTicks(height: number, pad = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const max = Math.max(...orders.map((o) => Math.abs(term(o, 'total')?.usd ?? 0)))
  const ticks: Tick[] = w ? orders.map((o) => {
    const usd = term(o, 'total')?.usd ?? null
    const x = pad + ((Date.parse(o.order.createdAt) - START) / (END - START)) * (w - 2 * pad)
    return { o, x, usd, measured: typeof usd === 'number', h: typeof usd === 'number' ? 6 + (height - 6) * Math.sqrt(Math.abs(usd) / max) : height * 0.3 }
  }) : []
  const days = w ? Array.from({ length: 31 }, (_, i) => ({ d: i + 1, x: pad + ((Date.UTC(2024, 0, i + 1) - START) / (END - START)) * (w - 2 * pad) })) : []
  return { ref, w, ticks, days }
}

/** Listbox behaviour for the tape: one tab stop, arrows move, Home and End jump, Enter or Space opens. */
export function useTickNav(count: number, onOpen: (i: number) => void) {
  const [active, setActive] = useState<number | null>(null)
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const cur = active ?? -1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(count - 1, cur + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur < 0 ? 0 : cur - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    else if ((e.key === 'Enter' || e.key === ' ') && active !== null) { e.preventDefault(); onOpen(active); return }
    if (next !== null) { e.preventDefault(); setActive(next) }
  }, [active, count, onOpen])
  return { active, setActive, onKeyDown }
}

/** Nearest tick to a pointer x, within 12 px. */
export function nearest(ticks: Tick[], x: number): number | null {
  let best: number | null = null, d = 12
  ticks.forEach((t, i) => { const dd = Math.abs(t.x - x); if (dd < d) { d = dd; best = i } })
  return best
}

export function useIsDesktop() {
  const [desk, setDesk] = useState(true)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)')
    const on = () => setDesk(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return desk
}
