/**
 * The number rule (orders of 2026-11-20): on first load a value renders in its final form, never counting from 0, and the
 * page's text is exactly the canonical string. Found by e2e on 2026-11-20: rendering NumberFlow at rest put its digit
 * spinner ("$0123456789...") into the heading's text, so Figure now renders plain text at rest.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Figure, sameText, USD_FORMAT } from './Figure'
import { formatUsd } from './format'

describe('Figure', () => {
  it('first render: the canonical text, no NumberFlow element', () => {
    const h = renderToStaticMarkup(<Figure value={15} text={formatUsd(15)} format={USD_FORMAT} />)
    expect(h).toBe('<span>$15.00</span>')
    expect(h).not.toMatch(/number-flow|0123456789/)
  })
  it('a special form stays text', () => {
    expect(renderToStaticMarkup(<Figure value={0.003} text={formatUsd(0.003)} format={USD_FORMAT} />)).toBe('<span>&lt;$0.01</span>')
  })
  it('sameText: NumberFlow is used only when Intl agrees with the canonical string', () => {
    expect(sameText(15, '$15.00', USD_FORMAT, 'en-US')).toBe(true)
    expect(sameText(0.003, '<$0.01', USD_FORMAT, 'en-US')).toBe(false)   // Intl says $0.00
    expect(sameText(-2, '−$2.00', USD_FORMAT, 'en-US')).toBe(false)     // formatUsd uses a true minus; Intl a hyphen
  })
})
