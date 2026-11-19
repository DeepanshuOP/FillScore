/**
 * The one hue of the charts: the measured colour, mixed with the surface. A mark never goes below HUE_MIN_SHARE of the
 * measured colour, because a pale mark must still be 3:1 against the ground (tested for both directions and surfaces).
 */
export const HUE_MIN_SHARE = 65
/** Share of the measured colour, 65 to 100, for a value between 0 and 1 (larger value, deeper colour). */
export function hueShare(t: number): number {
  return Math.round(HUE_MIN_SHARE + (100 - HUE_MIN_SHARE) * Math.min(1, Math.max(0, t)))
}
/** The three terms of the cost ruler, deepest first. */
export const RULER_SHARES = [100, 82, 65] as const
export const hueCss = (share: number) => `color-mix(in srgb, var(--ui-measured) ${share}%, var(--ui-surface))`
