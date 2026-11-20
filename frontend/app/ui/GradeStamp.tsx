'use client'

import { useEffect, useRef, useState } from 'react'
import { formatScore } from './format'

/**
 * The grade as a rubber stamp (design v3): "GRADED / A 93.4 / JANUARY 2024 / SCORING v2.3.0", in the stamp ink, with an
 * ink texture and a tilt. It stamps in once, on first view (the ink lands slightly oversized, then presses flat); with
 * reduced motion, or without JavaScript, it is simply there. The letter and score are the served grade, never computed
 * here. The stamp ink is the same for every letter: it is the auditor's mark, not a good/bad colour.
 */
export function GradeStamp({ grade, score, period, version, size = 'lg', className }: {
  grade: string; score: number; period: string; version: string; size?: 'lg' | 'sm'; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inked, setInked] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInked(true); io.disconnect() } }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`fs-stamp ${className ?? ''}`} data-size={size} data-in={inked} role="img"
      aria-label={`Graded ${grade}, ${formatScore(score)} of 100, ${period}, scoring ${version}`}>
      <div className="top" aria-hidden="true">GRADED</div>
      <div className="mid" aria-hidden="true"><span className="g">{grade}</span><span className="s">{formatScore(score)}</span></div>
      <div className="bot" aria-hidden="true">{period.toUpperCase()}<br />SCORING {version}</div>
    </div>
  )
}
