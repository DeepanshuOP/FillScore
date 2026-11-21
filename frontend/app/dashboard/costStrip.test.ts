import { describe, expect, it } from 'vitest'
import { describeStrip } from './costStrip'

// Design v3.1 chapter 3: the browser only names the server's parts and turns its shares into widths.
// demo-moderate (backend costStrip.test.ts): market 10.102258402914238 (share 0.19398113757038973),
// fees 41.97630206664916 (share 0.8060188624296103), total 52.0785604695634.
const BODY = { available: true, strip: { totalUsd: 52.0785604695634, segments: [
  { key: 'market', usd: 10.102258402914238, share: 0.19398113757038973 },
  { key: 'fees', usd: 41.97630206664916, share: 0.8060188624296103 },
] } }

describe('describeStrip', () => {
  it('names the parts, prints the server dollars and uses its shares as widths', () => {
    const v = describeStrip(BODY, true)!
    expect(v.parts.map((p) => [p.label, p.amount, p.width, p.dashed, p.drawn])).toEqual([
      ['Measured against market prices', '$10.10', '19.398%', false, true],   // 0.19398113757 x 100 = 19.398
      ['Fees, at the published rate', '$41.98', '80.602%', true, true],      // 0.80601886243 x 100 = 80.602
    ])
    expect(v.sentence).toBe('Fees were $41.98 of the $52.08.')
  })

  it('a real account: fees are measured, so not dashed', () => {
    expect(describeStrip(BODY, false)!.parts[1]).toMatchObject({ label: 'Fees', dashed: false })
  })

  it('a negative part has no width', () => {
    // backend: total 5, fees 8 -> market -3, share 0; fees share 1
    const v = describeStrip({ available: true, strip: { totalUsd: 5, segments: [{ key: 'market', usd: -3, share: 0 }, { key: 'fees', usd: 8, share: 1 }] } }, false)!
    expect(v.parts[0]).toMatchObject({ amount: '−$3.00', drawn: false, width: '0.000%' })
    expect(v.parts[1]).toMatchObject({ width: '100.000%', drawn: true })
  })

  it('is null when the server sent no strip or a malformed one', () => {
    expect(describeStrip({ available: true }, false)).toBeNull()
    expect(describeStrip({ available: false, strip: BODY.strip }, false)).toBeNull()
    expect(describeStrip({ available: true, strip: { totalUsd: 1, segments: [{ key: 'other', usd: 1, share: 1 }] } }, false)).toBeNull()
    expect(describeStrip(null, false)).toBeNull()
  })
})
