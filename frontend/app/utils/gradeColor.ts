/**
 * Grade colours as hex, for surfaces that cannot read CSS variables (the Open Graph image is a raster drawn on the dark
 * ground). Design v2: the dark-theme chip letters of app/ui/tokens.css (--ui-grade-a ... --ui-grade-f); a test keeps the
 * two equal. In the app, use the CSS variables (GradeChip) so the light theme gets its own set.
 */
const GRADE: Record<string, string> = { A: '#6BD6A6', B: '#A9D46F', C: '#E3C25B', D: '#E8955A', F: '#EF7A73' }

export function getGradeColor(grade: string): string {
  return GRADE[grade] ?? '#8A96A3'   // unknown grade: the secondary text colour
}
