'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Measures, in the browser, whether a family has true tabular figures: the ten digits are set at 28 px with
 * `tabular-nums` and with `proportional-nums`, each digit in its own inline-block, and the spread of their widths
 * (widest minus narrowest) is reported. A true tabular feature gives a spread of 0.00 px. A family whose default
 * figures are already equal width reports 0.00 px for both; the sentence says so.
 */
export function TabularCheck({ family }: { family: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [result, setResult] = useState<{ tabular: number; proportional: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled || !host.current) return
      const spread = (variant: 'tabular-nums' | 'proportional-nums') => {
        const widths = Array.from(host.current!.querySelectorAll<HTMLElement>(`[data-variant="${variant}"] span`)).map((s) => s.getBoundingClientRect().width)
        return Math.max(...widths) - Math.min(...widths)
      }
      setResult({ tabular: spread('tabular-nums'), proportional: spread('proportional-nums') })
    })
    return () => { cancelled = true }
  }, [family])

  const digits = '0123456789'.split('')
  const row = (variant: 'tabular-nums' | 'proportional-nums') => (
    <div data-variant={variant} aria-hidden="true" style={{ fontVariantNumeric: variant }} className="flex text-[1.75rem] leading-9">
      {digits.map((d) => <span key={d} className="inline-block">{d}</span>)}
    </div>
  )
  return (
    <div ref={host} style={{ fontFamily: family }}>
      {row('tabular-nums')}
      {row('proportional-nums')}
      <p data-testid="tabular-result" className="mt-2 font-[family-name:var(--ui-font)] text-sm text-ui-graphite" style={{ fontFamily: 'var(--ui-font)' }}>
        {result === null ? 'Measuring the digit widths in this browser.' : (
          <>Digit widths at 28 px, widest minus narrowest: tabular figures <strong className="text-ui-ink">{result.tabular.toFixed(2)} px</strong>, proportional figures {result.proportional.toFixed(2)} px.
            {result.proportional < 0.01 ? ' The default figures of this family are already equal width.' : ''}
            {' '}<strong data-testid="tabular-verdict" className="text-ui-ink">{result.tabular < 0.01 ? 'True tabular figures.' : 'Not truly tabular: the digits still differ in width.'}</strong></>
        )}
      </p>
    </div>
  )
}
