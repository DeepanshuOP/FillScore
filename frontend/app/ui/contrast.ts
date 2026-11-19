/** WCAG 2.x contrast, pure. Used by the contrast test and by GradeBadge to pick readable text on a grade colour. */

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`)
  const n = parseInt(m[1], 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** `share` percent of `fg` over `bg`, mixed in sRGB (what color-mix(in srgb) does), as #RRGGBB. */
export function mixHex(fg: string, bg: string, share: number): string {
  const n = (h: string) => { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255] }
  const [a, b] = [n(fg), n(bg)]
  return '#' + a.map((c, i) => Math.round((c * share) / 100 + b[i] * (1 - share / 100)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Near-black or white, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrastRatio('#111111', bg) >= contrastRatio('#FFFFFF', bg) ? '#111111' : '#FFFFFF'
}
