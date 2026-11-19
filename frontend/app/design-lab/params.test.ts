import { describe, expect, it } from 'vitest'
import { labHref, parseLab } from './params'

describe('parseLab', () => {
  it('defaults: direction A with IBM Plex Sans', () => {
    expect(parseLab({})).toEqual({ theme: 'a', font: 'plex' })
  })
  it('direction B defaults to Hanken Grotesk (Schibsted measured as not truly tabular); an explicit font wins', () => {
    expect(parseLab({ theme: 'b' })).toEqual({ theme: 'b', font: 'hanken' })
    expect(parseLab({ theme: 'b', font: 'plex' })).toEqual({ theme: 'b', font: 'plex' })
  })
  it('ignores unknown values and takes the first of a repeated one', () => {
    expect(parseLab({ theme: 'c', font: 'comic' })).toEqual({ theme: 'a', font: 'plex' })
    expect(parseLab({ theme: ['b', 'a'] })).toEqual({ theme: 'b', font: 'hanken' })
  })
})

describe('labHref', () => {
  it('keeps the direction and the font across pages', () => {
    expect(labHref('/design-lab/hero', { theme: 'b', font: 'hanken' })).toBe('/design-lab/hero?theme=b&font=hanken')
  })
})
