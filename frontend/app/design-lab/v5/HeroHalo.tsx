'use client'
import { useRef } from 'react'

/** A soft light that follows a fine pointer over the hero (marketing motion, PROPOSAL §7). None on touch or under reduced motion. */
export function HeroHalo({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = ref.current!.getBoundingClientRect()
    ref.current!.style.setProperty('--hx', `${e.clientX - r.left}px`)
    ref.current!.style.setProperty('--hy', `${e.clientY - r.top}px`)
  }
  return (
    <div ref={ref} onPointerMove={move} className="v-halo relative">
      {children}
    </div>
  )
}
