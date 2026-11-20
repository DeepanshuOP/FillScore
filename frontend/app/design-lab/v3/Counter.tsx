'use client'

import { useEffect, useRef, useState } from 'react'
import NumberFlow, { type Format } from '@number-flow/react'
import { sameText } from '../../ui/Figure'

const MS = 700

/**
 * The lab's mechanical counter, on the production Figure's rules (app/ui/Figure.tsx): first load shows the final value
 * as plain text; a value that changes after a user action rolls with NumberFlow, only when NumberFlow's Intl output equals
 * the canonical string for both values; reduced motion never rolls; no scramble. At rest the fraction is split off in
 * its own span (a tone step, as the counter's ::part(fraction) while it rolls), so the text is still exactly `text`.
 */
export function Counter({ value, text, format, className }: { value: number | null; text: string; format: Format; className?: string }) {
  const prev = useRef({ value, text })
  const [roll, setRoll] = useState<number | null>(null)
  useEffect(() => {
    const old = prev.current
    prev.current = { value, text }
    if (old.value === value) return
    const ok = (v: number | null, t: string): v is number => typeof v === 'number' && Number.isFinite(v) && sameText(v, t, format, 'en-US')
    if (!ok(old.value, old.text) || !ok(value, text)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = requestAnimationFrame(() => {
      setRoll(old.value)
      raf = requestAnimationFrame(() => setRoll(value))
    })
    const done = window.setTimeout(() => setRoll(null), MS + 150)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done) }
  }, [value, text, format])

  if (roll === null) {
    const i = text.lastIndexOf('.')
    return <span className={className}>{i > 0 ? (<><span className="int">{text.slice(0, i)}</span><span className="dec">{text.slice(i)}</span></>) : text}</span>
  }
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <NumberFlow aria-hidden="true" value={roll} format={format} locales="en-US" className="counter-roll"
        transformTiming={{ duration: MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }} spinTiming={{ duration: MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }} trend={0} />
    </span>
  )
}
