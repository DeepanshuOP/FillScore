'use client'

import { useEffect, useRef, useState } from 'react'
import { formatScore } from '../../../ui/format'

/**
 * The grade as a rubber stamp. Stamps in once, on first view (ink lands slightly oversized and blurred, then presses
 * flat); with reduced motion it is simply there. The letter and score are the served v2 grade, never computed here.
 */
export function GradeStamp({ grade, score, period, version }: { grade: string; score: number; period: string; version: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [inked, setInked] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInked(true); io.disconnect() } }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="t-stamp" data-in={inked} role="img" aria-label={`Graded ${grade}, ${formatScore(score)} of 100, ${period}, scoring ${version}`}>
      <div className="top" aria-hidden>GRADED</div>
      <div className="mid" aria-hidden><span className="g">{grade}</span><span className="s">{formatScore(score)}</span></div>
      <div className="bot" aria-hidden>{period.toUpperCase()}<br />SCORING {version}</div>
    </div>
  )
}
