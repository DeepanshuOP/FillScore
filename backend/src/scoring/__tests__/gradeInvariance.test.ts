import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 4a: markouts, spread estimates and the spread-aware counterfactual are ADDITIONAL analytics. The FillScore
// composite and the six locked demo grades must stay byte-identical (CLAUDE.md product rule 5).
const ROOT = path.resolve(__dirname, '../../../..');
const LOCKED: Array<[string, string]> = [
    ['demo-disciplined', '95.88542572161496'],
    ['demo-moderate', '84.80888516669383'],
    ['demo-aggressive', '60.67469266790485'],
    ['demo-bybit', '76.16413408878628'],
    ['demo-okx', '81.6589477402669'],
    ['demo-multi', '70.71963854879698'],
];

describe('locked demo grades are unchanged by 4a', () => {
    const profiles = fs.readFileSync(path.join(ROOT, 'frontend/app/utils/demoProfiles.ts'), 'utf8');
    it.each(LOCKED)('%s keeps score %s', (_id, score) => {
        expect(profiles).toContain(`score: ${score},`);
    });

    it('the scoring engine has no input path from the new enrichment fields', () => {
        const dir = path.join(ROOT, 'backend/src/scoring');
        const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
        for (const f of sources) {
            const text = fs.readFileSync(path.join(dir, f), 'utf8');
            expect(text, f).not.toMatch(/postPrices|halfSpreadBps|markout/i);
        }
    });
});
