import { describe, it, expect } from 'vitest';
import { DEMO_V2_GRADES } from '../../data/demoV2Grades';

// Re-lock of the rebuilt demos' MEASURED grades under Scoring v2.3.0 (the implementation-shortfall decomposition,
// ADR-0014), 2026-11-14. These are the values ml-service/scripts/build_demo_v2.py produced from real January 2024 prints,
// graded through the production measurement job and scorer; no weight or mapping was tuned toward an expected order.
// They sit BESIDE the three v1 grades of gradeInvariance.test.ts, which are untouched: v1 stays the published, frozen
// audit of the earlier demo data. A later calibration or scoring change is a new version id with its own pins, never an
// edit of these. The earlier versions stay reproducible: v2.0.0 to v2.2.0 keep their code paths and version files
// (ml-service/tests/scoring_v2/test_version.py pins every version file; test_shortfall_decomposition.py scores a fixture
// under both the old and the new reading).
const LOCKED_V230: Array<[string, number, string]> = [
    ['demo-aggressive', 94.34969957374337, 'A'],
    ['demo-moderate', 93.40556873724222, 'A'],
    ['demo-disciplined', 93.67696144989966, 'A'],
];
const VERSION_FILE_SHA256 = '2a4d6b1ad79a2b7d22aecfe7cae7b0d894db2865a54b4dfae2f8d77cea0f4fa3';

// The v2.2.0 composites of the same demo data, recorded when v2.2.0 was current (ADR-0013). Not served any more; kept
// here as the record of what the earlier version gave, so the change of reading stays visible.
const RECORD_V220: Array<[string, number, string]> = [
    ['demo-aggressive', 90.28144243732656, 'A'],
    ['demo-moderate', 90.4794342087216, 'A'],
    ['demo-disciplined', 90.05877968287757, 'A'],
];

describe('locked v2.3.0 demo grades', () => {
    it.each(LOCKED_V230)('%s keeps composite %s (%s)', (id, composite, grade) => {
        const g = (DEMO_V2_GRADES as any)[id];
        expect(g.scoringVersion).toBe('v2.3.0');
        expect(g.versionFileSha256).toBe(VERSION_FILE_SHA256);
        expect(g.result.composite).toBe(composite);
        expect(g.result.grade).toBe(grade);
    });

    it('the scored components are the shortfall terms, and timing is information only', () => {
        for (const [id] of LOCKED_V230) {
            const r = (DEMO_V2_GRADES as any)[id].result;
            expect(Object.keys(r.components).sort()).toEqual(['execution', 'fees', 'unfilled']);
            expect(r.timing.scored).toBe(false);
            expect(r.timing.message).toBe('No material difference between hours.');
        }
    });

    it('the composite is the equal-weight mean of the three components', () => {
        for (const [id] of LOCKED_V230) {
            const c = (DEMO_V2_GRADES as any)[id].result;
            const mean = (c.components.execution.score + c.components.fees.score + c.components.unfilled.score) / 3;
            expect(c.composite).toBeCloseTo(mean, 9);
        }
    });

    it('records the v2.2.0 composites that this reading replaced (all three were A)', () => {
        expect(RECORD_V220.map(r => r[2])).toEqual(['A', 'A', 'A']);
        for (const [id, old] of RECORD_V220) {
            const now = (DEMO_V2_GRADES as any)[id].result.composite;
            expect(Math.abs(now - old)).toBeGreaterThan(0);          // a different reading gives different numbers
            expect(Math.abs(now - old)).toBeLessThan(10);            // and not a different letter here
        }
    });
});
