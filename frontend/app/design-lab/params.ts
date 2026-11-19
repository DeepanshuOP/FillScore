/** The lab's two switches, carried in the URL so a screenshot is reproducible: direction (A light, B dark) and type family. */
export type Theme = 'a' | 'b'
export type Font = 'plex' | 'hanken' | 'schibsted'
export interface LabParams { theme: Theme; font: Font }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// Schibsted Grotesk measured 1.00 px of digit-width spread with tabular figures on (2026-11-19, specimen page), so it is
// not the default of either direction; B uses Hanken Grotesk, which measured 0.00 px.
export const DEFAULT_FONT: Record<Theme, Font> = { a: 'plex', b: 'hanken' }

export function parseLab(q: Record<string, string | string[] | undefined>): LabParams {
  const t = first(q.theme)
  const theme: Theme = t === 'b' ? 'b' : 'a'
  const f = first(q.font)
  const font: Font = f === 'plex' || f === 'hanken' || f === 'schibsted' ? f : DEFAULT_FONT[theme]
  return { theme, font }
}

export function labHref(path: string, p: LabParams): string {
  return `${path}?theme=${p.theme}&font=${p.font}`
}
