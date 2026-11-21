'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatScore } from './format'

/**
 * The grade as a rubber stamp (design v3): "GRADED / A 93.4 / JANUARY 2024 / SCORING v2.3.0", in the stamp ink, with an
 * ink texture and a tilt. It stamps in once, on first view (the ink lands slightly oversized, then presses flat); with
 * reduced motion, or without JavaScript, it is simply there. The letter and score are the served grade, never computed
 * here. The stamp ink is the same for every letter: it is the auditor's mark, not a good/bad colour.
 * Design v3.1: `press` hands the moment to the caller (the overview presses it on the chapter's first entry only, once
 * a session); `drawing` hides the CSS border while the caller draws it as SVG strokes (`children`, inside the ink mask).
 */
export function GradeStamp({ grade, score, period, version, size = 'lg', className, press, drawing, children }: {
  grade: string; score: number; period: string; version: string; size?: 'lg' | 'sm'; className?: string
  press?: boolean; drawing?: boolean; children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inked, setInked] = useState(false)
  const controlled = press !== undefined
  useEffect(() => {
    const el = ref.current
    if (controlled || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInked(true); io.disconnect() } }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [controlled])
  return (
    <div ref={ref} className={`fs-stamp ${className ?? ''}`} data-size={size} data-in={controlled ? press : inked} data-drawing={drawing ? 'true' : undefined} role="img"
      aria-label={`Graded ${grade}, ${formatScore(score)} of 100, ${period}, scoring ${version}`}>
      <div className="top" aria-hidden="true">GRADED</div>
      <div className="mid" aria-hidden="true"><span className="g">{grade}</span><span className="s">{formatScore(score)}</span></div>
      {/* design v3.1: the small stamp (landing demo receipts) prints the period only; the version stays in its label */}
      <div className="bot" aria-hidden="true">{period.toUpperCase()}{size === 'sm' ? null : <><br />SCORING {version}</>}</div>
      {children}
    </div>
  )
}
