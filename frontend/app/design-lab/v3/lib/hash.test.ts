import { describe, expect, it } from 'vitest'
import { bars, barsWidth, canonicalJson, sha256Hex } from './hash'

describe('receipt hash and bars', () => {
  it('canonical JSON sorts keys at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}')
  })

  it('SHA-256 of "abc" is the FIPS 180-2 test vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('draws one bar per hex digit with the stated widths', () => {
    // "0": bar 1 + (0>>2)=1, gap 1 + (0&3)=1 -> x 0, next at 2
    // "f": 15 -> bar 1 + 3 = 4, gap 1 + 3 = 4 -> x 2, width 4
    // "6": 6 -> bar 1 + 1 = 2 -> x 2 + 4 + 4 = 10
    expect(bars('0f6')).toEqual([{ x: 0, w: 1 }, { x: 2, w: 4 }, { x: 10, w: 2 }])
    expect(barsWidth(bars('0f6'))).toBe(12)
  })
})
