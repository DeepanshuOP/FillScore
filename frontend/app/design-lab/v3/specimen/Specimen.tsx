'use client'

import { useEffect, useRef, useState } from 'react'

const FACES = [
  { v: '--f-cabinet', name: 'Cabinet Grotesk', role: 'Display and UI, direction 1 (candidate)', weight: 900 },
  { v: '--f-clash', name: 'Clash Grotesk', role: 'Display and UI, direction 1 (candidate)', weight: 700 },
  { v: '--f-departure', name: 'Departure Mono', role: 'Receipt and tape mono, direction 1 (candidate)', weight: 400 },
  { v: '--f-martian', name: 'Martian Mono', role: 'Receipt and tape mono, direction 1 (candidate)', weight: 400 },
  { v: '--f-archivo', name: 'Archivo (wdth 125)', role: 'Display, direction 2', weight: 900, stretch: '125%' },
  { v: '--f-archivo', name: 'Archivo (wdth 100)', role: 'UI, direction 2', weight: 500, stretch: '100%' },
  { v: '--f-fragment', name: 'Fragment Mono', role: 'Labels and hashes, direction 2', weight: 400 },
]

/**
 * Measures, in this browser, whether each face sets the ten digits at one width with tabular figures on (the rule for
 * every table font): each digit is drawn in its own span and its width read back.
 */
function useDigitWidths(family: string, weight: number, stretch?: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [res, setRes] = useState<{ min: number; max: number } | null>(null)
  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => {
      const el = ref.current
      if (!el || !live) return
      const ws = [...el.querySelectorAll('span')].map((s) => s.getBoundingClientRect().width)
      setRes({ min: Math.min(...ws), max: Math.max(...ws) })
    })
    return () => { live = false }
  }, [family, weight, stretch])
  const probe = (
    <div ref={ref} aria-hidden style={{ position: 'absolute', visibility: 'hidden', fontFamily: family, fontWeight: weight, fontStretch: stretch, fontSize: 100, fontVariantNumeric: 'tabular-nums' }}>
      {'0123456789'.split('').map((d) => <span key={d} style={{ display: 'inline-block' }}>{d}</span>)}
    </div>
  )
  return { probe, res }
}

function Row({ f }: { f: (typeof FACES)[number] }) {
  const family = `var(${f.v})`
  const { probe, res } = useDigitWidths(family, f.weight, f.stretch)
  const tab = res ? res.max - res.min < 0.05 : null
  return (
    <section className="spec-row">
      <div className="n">
        <b>{f.name}</b><br />{f.role}<br />
        tabular digits at 100 px: {res ? `${res.min.toFixed(2)} to ${res.max.toFixed(2)} px, ${tab ? 'one width' : 'NOT tabular'}` : 'measuring'}
      </div>
      <div style={{ fontFamily: family, fontWeight: f.weight, fontStretch: f.stretch, position: 'relative' }}>
        {probe}
        <div style={{ fontSize: 88, lineHeight: 0.92, letterSpacing: f.v.includes('mono') || f.v.includes('departure') || f.v.includes('fragment') ? 0 : '-0.045em' }}>$52.08 A 93.4</div>
        <div style={{ fontSize: 22, marginTop: 10, fontWeight: Math.min(f.weight, 500) }}>245 orders paid $52.08 in January 2024, 11.7 bps of what they set out to trade.</div>
        <div style={{ fontSize: 15, marginTop: 8, fontVariantNumeric: 'tabular-nums', fontWeight: 400 }}>41,918.39   0.00343   20:41:36.963   10.0 bps   −$0.41   1111.11 / 8888.88</div>
      </div>
    </section>
  )
}

export function Specimen() {
  return <>{FACES.map((f) => <Row key={f.name} f={f} />)}</>
}
