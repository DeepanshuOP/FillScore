/**
 * The receipt's hash line and its bars. The hash is SHA-256 of the order record as the replay returns it (canonical
 * JSON, keys sorted). The bars are a picture of that hash, one group per hex digit; they are not a scannable barcode
 * and the receipt says so.
 */

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(v)
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Bars for a hex string: each digit becomes a bar of width 1 + (d >> 2) and a gap of width 1 + (d & 3), in units. */
export function bars(hex: string): Array<{ x: number; w: number }> {
  const out: Array<{ x: number; w: number }> = []
  let x = 0
  for (const ch of hex) {
    const d = parseInt(ch, 16)
    if (Number.isNaN(d)) continue
    const w = 1 + (d >> 2), gap = 1 + (d & 3)
    out.push({ x, w })
    x += w + gap
  }
  return out
}

export const barsWidth = (b: Array<{ x: number; w: number }>) => (b.length ? b[b.length - 1].x + b[b.length - 1].w : 0)
