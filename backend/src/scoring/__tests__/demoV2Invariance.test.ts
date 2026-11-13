import { describe, it, expect } from 'vitest';
import { DEMO_V2_GRADES } from '../../data/demoV2Grades';

// Re-lock of the rebuilt demos' MEASURED grades (Scoring v2.2.0, ADR-0013), prepared 2026-11-13. These are the values
// ml-service/scripts/build_demo_v2.py produced from real January 2024 prints; they take effect for users once
// Deepanshu applies the seed (docs/PROGRESS.md, Waiting item 9). They sit BESIDE the six v1 grades of
// gradeInvariance.test.ts, which are untouched: v1 stays the published, frozen audit of the earlier demo data.
// A later calibration or scoring change is a new version id with its own pins, never an edit of these.
const LOCKED_V2: Array<[string, number, string]> = [
    ['demo-aggressive', 90.28144243732656, 'A'],
    ['demo-moderate', 90.4794342087216, 'A'],
    ['demo-disciplined', 90.05877968287757, 'A'],
];
const VERSION_FILE_SHA256 = 'a0fa45c7ab977bd7c3f3c1afa8afc83f7ee5810a44011896868ab9bb5c3c3e8d';

describe('locked v2.2.0 demo grades', () => {
    it.each(LOCKED_V2)('%s keeps composite %s (%s)', (id, composite, grade) => {
        const g = (DEMO_V2_GRADES as any)[id];
        expect(g.scoringVersion).toBe('v2.2.0');
        expect(g.versionFileSha256).toBe(VERSION_FILE_SHA256);
        expect(g.result.composite).toBe(composite);
        expect(g.result.grade).toBe(grade);
    });

    it('the timing component is 100 for every demo: no hour cost more than one price step above the cheapest hours', () => {
        for (const [id] of LOCKED_V2) {
            expect((DEMO_V2_GRADES as any)[id].result.components.timing.score).toBeGreaterThan(99.999);
        }
    });
});
