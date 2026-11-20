// Design v2 (2026-11-20): the grade colours changed from the saturated set to the refined chip set of DESIGN.md; the
// test now pins the new values and that they equal the dark theme's --ui-grade-* tokens (one source for the raster).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getGradeColor } from './gradeColor';

const css = readFileSync(resolve(__dirname, '../ui/tokens.css'), 'utf8');
const dark = css.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)![1];
const token = (g: string) => dark.match(new RegExp(`--ui-grade-${g}:\\s*(#[0-9A-Fa-f]{6})`))![1];

describe('getGradeColor', () => {
  it.each(['A', 'B', 'C', 'D', 'F'])('grade %s equals the dark token', (g) => expect(getGradeColor(g)).toBe(token(g.toLowerCase())));
  it('pins the values', () => expect(['A', 'B', 'C', 'D', 'F'].map(getGradeColor)).toEqual(['#6BD6A6', '#A9D46F', '#E3C25B', '#E8955A', '#EF7A73']));
  it('an unknown grade reads the secondary text colour', () => expect(getGradeColor('X')).toBe('#8A96A3'));
});
