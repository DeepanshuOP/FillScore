'use client'

import { useEffect, useRef, useState } from 'react'
import NumberFlow, { type Format } from '@number-flow/react'

const DURATION_MS = 650

/**
 * A number that may animate when it changes after a user action (switching account, period or tab), never on first
 * load (orders of 2026-11-20, "Number rule"). At rest it is plain text, the canonical string from app/ui/format.ts, so
 * the page's text (copy, find, screen readers, tests) is always exactly that string. When the value changes after mount,
 * NumberFlow is mounted on the old value, rolls to the new one, and the plain text returns when it is done.
 * NumberFlow is used only when its own Intl output equals the canonical string for both values, so special forms
 * ("<$0.01", "not computed", true minus signs) never pass through it. With reduced motion NumberFlow does not animate.
 */
export function Figure({ value, text, format, locales = 'en-US', className }: {
  value: number | null | undefined
  text: string
  format?: Format
  locales?: string
  className?: string
}) {
  const prev = useRef<{ value: number | null | undefined; text: string }>({ value, text })
  const [flow, setFlow] = useState<{ from: number; to: number } | null>(null)
  const [shown, setShown] = useState<number | null>(null)

  useEffect(() => {
    const old = prev.current
    prev.current = { value, text }
    if (old.value === value) return
    const ok = (v: unknown, t: string): v is number => typeof v === 'number' && Number.isFinite(v) && sameText(v, t, format, locales)
    if (!ok(old.value, old.text) || !ok(value, text)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = old.value, to = value
    let raf = requestAnimationFrame(() => {
      setFlow({ from, to })
      setShown(from)
      raf = requestAnimationFrame(() => setShown(to))
    })
    const done = window.setTimeout(() => { setFlow(null); setShown(null) }, DURATION_MS + 150)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done) }
  }, [value, text, format, locales])

  if (!flow || shown === null) return <span className={className}>{text}</span>
  return (
    <>
      <span className="sr-only">{text}</span>
      <NumberFlow aria-hidden="true" value={shown} format={format} locales={locales} className={className}
        transformTiming={{ duration: DURATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }} spinTiming={{ duration: DURATION_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }} />
    </>
  )
}

/** True when Intl formats `value` exactly as `text` (ASCII hyphen and true minus treated as different on purpose). */
export function sameText(value: number, text: string, format: Format | undefined, locales: string): boolean {
  try {
    return new Intl.NumberFormat(locales, format as Intl.NumberFormatOptions).format(value) === text
  } catch {
    return false
  }
}

export const USD_FORMAT: Format = { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }
export const SCORE_FORMAT: Format = { minimumFractionDigits: 1, maximumFractionDigits: 1 }
export const INT_FORMAT: Format = { maximumFractionDigits: 0 }
