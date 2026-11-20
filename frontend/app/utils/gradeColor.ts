/**
 * Grade colours as hex, for surfaces that cannot read CSS variables (the Open Graph image is a raster printed on the
 * paper ground). Design v3: every grade is stamped in the paper theme's pen-ink (app/ui/tokens.css, --ui-grade-a ...
 * --ui-grade-f); a test keeps the two equal. The stamp is the auditor's mark, never a good/bad colour.
 */
const PEN_INK = '#C2380A'
const GRADE: Record<string, string> = { A: PEN_INK, B: PEN_INK, C: PEN_INK, D: PEN_INK, F: PEN_INK }

export function getGradeColor(grade: string): string {
  return GRADE[grade] ?? '#6B6A66'   // unknown grade: the paper theme's graphite
}
