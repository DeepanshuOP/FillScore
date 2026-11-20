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

/**
 * Design v3's display figure: the same number rule as `Figure`, set at display scale with the cents stepped down to
 * graphite (`$52` in ink, `.08` in graphite). At rest the text is exactly `text`, split at its last decimal point into
 * two spans; while it rolls, NumberFlow's own `fraction` and `decimal` parts carry the graphite (a tone step, because
 * NumberFlow cannot change digit size mid-roll). Never counts up on first load.
 */
export function SplitFigure({ value, text, format, className }: { value: number | null | undefined; text: string; format?: Format; className?: string }) {
  const prev = useRef<{ value: number | null | undefined; text: string }>({ value, text })
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    const old = prev.current
    prev.current = { value, text }
    if (old.value === value) return
    const ok = (v: unknown, t: string): v is number => typeof v === 'number' && Number.isFinite(v) && sameText(v, t, format, 'en-US')
    if (!ok(old.value, old.text) || !ok(value, text)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = old.value, to = value
    let raf = requestAnimationFrame(() => { setShown(from); raf = requestAnimationFrame(() => setShown(to)) })
    const done = window.setTimeout(() => setShown(null), DURATION_MS + 150)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(done) }
  }, [value, text, format])
  if (shown === null) {
    const i = text.lastIndexOf('.')
    return <span className={className}>{i > 0 ? (<><span>{text.slice(0, i)}</span><span className="text-ui-graphite">{text.slice(i)}</span></>) : text}</span>
  }
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <NumberFlow aria-hidden="true" value={shown} format={format} locales="en-US" className="fs-split-roll" trend={0}
        transformTiming={{ duration: DURATION_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }} spinTiming={{ duration: DURATION_MS, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }} />
    </span>
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
