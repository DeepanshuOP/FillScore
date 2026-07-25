import { describe, it, expect } from 'vitest';
import { getGradeColor } from './gradeColor';

describe('getGradeColor', () => {
  it('returns Green for A', () => expect(getGradeColor('A')).toBe('#4ade80'));
  it('returns Light Green for B', () => expect(getGradeColor('B')).toBe('#bbf7d0'));
  it('returns Amber for C', () => expect(getGradeColor('C')).toBe('#fcd34d'));
  it('returns Orange for D', () => expect(getGradeColor('D')).toBe('#fb923c'));
  it('returns Red for F', () => expect(getGradeColor('F')).toBe('#ef4444'));
  it('returns Accent fallback for unknown', () => expect(getGradeColor('X')).toBe('#a78b71'));
});
