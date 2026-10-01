import { describe, it, expect } from 'vitest';
import { DEMO_PROFILES, gradeFromScore } from './demoProfiles';

describe('gradeFromScore', () => {
  it.each([
    [100, 'A'], [90, 'A'], [89.99, 'B'], [75, 'B'], [74.99, 'C'],
    [60, 'C'], [59.99, 'D'], [40, 'D'], [39.99, 'F'], [0, 'F'],
  ])('%f -> %s', (score, grade) => {
    expect(gradeFromScore(score)).toBe(grade);
  });
});

describe('DEMO_PROFILES', () => {
  const byId = Object.fromEntries(DEMO_PROFILES.map(p => [p.id, p]));

  it('lists exactly the six canonical demo accounts', () => {
    expect(DEMO_PROFILES.map(p => p.id).sort()).toEqual([
      'demo-aggressive', 'demo-bybit', 'demo-disciplined', 'demo-moderate', 'demo-multi', 'demo-okx',
    ]);
  });

  it('carries the locked canonical scores from ROADMAP section 2.1', () => {
    expect(byId['demo-disciplined'].score).toBe(95.88542572161496);
    expect(byId['demo-moderate'].score).toBe(84.80888516669383);
    expect(byId['demo-aggressive'].score).toBe(60.67469266790485);
    expect(byId['demo-bybit'].score).toBeCloseTo(76.164, 3);
    expect(byId['demo-okx'].score).toBeCloseTo(81.659, 3);
    expect(byId['demo-multi'].score).toBeCloseTo(70.720, 3);
  });

  it('never carries a retired grade set', () => {
    const retired = [95.675, 84.570, 60.771];
    for (const p of DEMO_PROFILES) {
      for (const r of retired) expect(p.score).not.toBeCloseTo(r, 3);
    }
  });

  it('derives the canonical letter grades: A, B, C, B, B, C', () => {
    expect(gradeFromScore(byId['demo-disciplined'].score)).toBe('A');
    expect(gradeFromScore(byId['demo-moderate'].score)).toBe('B');
    expect(gradeFromScore(byId['demo-aggressive'].score)).toBe('C');
    expect(gradeFromScore(byId['demo-bybit'].score)).toBe('B');
    expect(gradeFromScore(byId['demo-okx'].score)).toBe('B');
    expect(gradeFromScore(byId['demo-multi'].score)).toBe('C');
  });
});
