import { describe, expect, it } from 'vitest'
import { describeStrip } from './costStrip'

// Design v3.1 chapter 3 and fixes F1: the browser only names the server's parts and turns its shares into widths.
// demo-moderate (backend costStrip.test.ts): total 52.0785604695634 = fees 41.97630206664916 + missed fills 10.631536
// + filled-order execution -0.5292775970857626. Positive sum 41.97630206664916 + 10.631536 = 52.607838066649165:
// missed share 10.631536 / 52.607838 = 0.20209034225148823, fees 0.7979096577485117, below 0.5292776 / 52.607838 = 0.01006081.
const BODY = { available: true, strip: { totalUsd: 52.0785604695634, segments: [
  { key: 'execution', usd: -0.5292775970857626, share: 0, below: 0.01006081254308826 },
  { key: 'missed', usd: 10.631536, share: 0.20209034225148823, below: 0 },
  { key: 'fees', usd: 41.97630206664916, share: 0.7979096577485117, below: 0 },
] } }

describe('describeStrip', () => {
  it('names the three parts, prints the server dollars and uses its shares as widths', () => {
    const v = describeStrip(BODY, true)!
    expect(v.parts.map((p) => [p.key, p.label, p.amount, p.width, p.dashed, p.drawn])).toEqual([
      ['execution', "Filled orders' execution, better than the market", '−$0.53', '0.000%', false, false],
      ['missed', 'Unfilled orders', '$10.63', '20.209%', false, true],   // 0.20209034 x 100 = 20.209
      ['fees', 'Fees', '$41.98', '79.791%', true, true],            // 0.79790966 x 100 = 79.791
    ])
    // the improvement is drawn below the line: 0.01006081 x 100 = 1.006
    expect(v.parts[0].below).toBe('1.006%')
    expect(v.parts[1].below).toBeNull()
    // the unfilled and fee parts say what they are (F1)
    expect(v.parts[1].caption).toBe('the market moved away from them')
    expect(v.parts[2].caption).toBe('at the published rate, not independently measured')
  })

  it('the chapter sentence states the parts with the server values (improvement case)', () => {
    expect(describeStrip(BODY, true)!.sentence).toBe(
      'Fees, at the published rate, were $41.98 of the $52.08; the market moved $10.63 away from orders that never filled; filled orders came out $0.53 better than the market.')
    // a real account: fees measured, so named plainly
    expect(describeStrip(BODY, false)!.sentence).toBe(
      'Fees were $41.98 of the $52.08; the market moved $10.63 away from orders that never filled; filled orders came out $0.53 better than the market.')
  })

  it('the chapter sentence in a cost case: filled-order execution cost money, nothing unfilled', () => {
    // total 12 = fees 9 + missed 0 + execution 3 (shares 0.25 / 0 / 0.75)
    const v = describeStrip({ available: true, strip: { totalUsd: 12, segments: [
      { key: 'execution', usd: 3, share: 0.25, below: 0 }, { key: 'missed', usd: 0, share: 0, below: 0 }, { key: 'fees', usd: 9, share: 0.75, below: 0 },
    ] } }, false)!
    expect(v.sentence).toBe("Fees were $9.00 of the $12.00; filled orders' execution cost $3.00.")
    expect(v.parts[0]).toMatchObject({ label: "Filled orders' execution", amount: '$3.00', width: '25.000%', drawn: true })
    // a part with no dollars has no caption and no width, and is not listed as drawn
    expect(v.parts[1]).toMatchObject({ amount: '$0.00', drawn: false })
  })

  it('fees larger than the total: the sentence does not say "of the" total', () => {
    // total 5, fees 8, missed 2, execution -5 (shares 0 / 0.2 / 0.8, below 0.5)
    const v = describeStrip({ available: true, strip: { totalUsd: 5, segments: [
      { key: 'execution', usd: -5, share: 0, below: 0.5 }, { key: 'missed', usd: 2, share: 0.2, below: 0 }, { key: 'fees', usd: 8, share: 0.8, below: 0 },
    ] } }, false)!
    expect(v.sentence).toBe('Fees were $8.00; the market moved $2.00 away from orders that never filled; filled orders came out $5.00 better than the market; $5.00 in total.')
    expect(v.parts[0].below).toBe('50.000%')
  })

  it('says "cost", not "paid", when there is no fee part to name (the total can include unfilled orders)', () => {
    const v = describeStrip({ available: true, strip: { totalUsd: 3, segments: [
      { key: 'execution', usd: 3, share: 1, below: 0 }, { key: 'missed', usd: 0, share: 0, below: 0 }, { key: 'fees', usd: 0, share: 0, below: 0 },
    ] } }, false)!
    expect(v.sentence).toBe('The orders cost $3.00.')
  })

  it('is null when the server sent no strip or a malformed one', () => {
    expect(describeStrip({ available: true }, false)).toBeNull()
    expect(describeStrip({ available: false, strip: BODY.strip }, false)).toBeNull()
    expect(describeStrip({ available: true, strip: { totalUsd: 1, segments: [{ key: 'other', usd: 1, share: 1 }] } }, false)).toBeNull()
    // the earlier two-part strip (market + fees) is no longer served
    expect(describeStrip({ available: true, strip: { totalUsd: 1, segments: [{ key: 'market', usd: 1, share: 1 }, { key: 'fees', usd: 0, share: 0 }] } }, false)).toBeNull()
    expect(describeStrip(null, false)).toBeNull()
  })
})
