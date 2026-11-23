/**
 * Deepanshu's decision (2026-11-23): every receipt-style fee line reads "Fees (published rate)" on the line itself, as the
 * unfilled line reads "Unfilled orders (modelled)". Reason: the fee figure is the published rate applied to the fills, not an
 * independently measured fee (DESIGN.md section 12 rule 6), and a note fold is not where that may live alone.
 * One wording test per surface that prints a fee line: the hero's phone receipt, the three printed objects of /how-it-works.
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HowItReads } from './HowItReads'
import { TapeHero } from './TapeHero'
import { FEE_LINE } from '../../dashboard/receiptCopy'

describe('fee line wording on the marketing receipts', () => {
  it('the shared label is the decided wording', () => {
    expect(FEE_LINE).toBe('Fees (published rate)')
  })
  it('/how-it-works mini receipt: line 03 reads Fees (published rate)', () => {
    const html = renderToStaticMarkup(<HowItReads />)
    expect(html).toContain('<span class="lab">Fees (published rate)</span>')
    expect(html).not.toContain('<span class="lab">Fees</span>')
  })
  it('hero phone receipt: the fee row reads Fees (published rate)', () => {
    const html = renderToStaticMarkup(<TapeHero />)
    const list = html.slice(html.indexOf('fs-hero-list'))
    expect(list).toContain('<dt>FEES (PUBLISHED RATE)</dt>')
    expect(list).not.toContain('<dt>FEES</dt>')
  })
})
