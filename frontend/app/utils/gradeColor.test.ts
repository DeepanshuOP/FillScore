// Design v3 (2026-11-20): grades are stamped in one ink, the paper theme's pen-ink (DESIGN.md, "Stamp"); the test pins
// the values and that they equal the paper theme's --ui-grade-* tokens (one source for the raster).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getGradeColor } from './gradeColor';

const css = readFileSync(resolve(__dirname, '../ui/tokens.css'), 'utf8');
const paper = css.match(/\[data-theme="paper"\]\s*\{([^}]*)\}/)![1];
const token = (g: string) => paper.match(new RegExp(`--ui-grade-${g}:\\s*(#[0-9A-Fa-f]{6})`))![1];

describe('getGradeColor', () => {
  it.each(['A', 'B', 'C', 'D', 'F'])('grade %s equals the paper token', (g) => expect(getGradeColor(g)).toBe(token(g.toLowerCase())));
  it('pins the values: one stamp ink for every grade', () => expect(['A', 'B', 'C', 'D', 'F'].map(getGradeColor)).toEqual(Array(5).fill('#C2380A')));
  it('an unknown grade reads the secondary text colour', () => expect(getGradeColor('X')).toBe('#6B6A66'));
});
