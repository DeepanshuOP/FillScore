import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../../../backend/src/constants/adviceTerms';
import { REBUILT_FILES } from './rebuiltFiles';

// Scans the user-visible text (JSX text nodes and string literals) of the pages that render audit copy:
// dashboard coach/insights, Trade Journal (trades page) and the share card.
// M8 part 1 (2026-11-20): ScoreV2Panel.tsx is replaced by ScoreRecord.tsx, and every rebuilt screen is added.
// ordersView.ts is left out of this scan only: its generic type parameters (`Array<[keyof Totals, string]>`) look like JSX text
// to the scanner and its object keys name the stored field "opportunity". Its visible strings are rendered by OrdersPanel.tsx
// (scanned) and read by the e2e advice scans of the rendered page.
const FILES = [...REBUILT_FILES.filter((f) => f !== 'app/dashboard/ordersView.ts'), 'app/trades/page.tsx', 'app/share/[userId]/page.tsx', 'app/utils/makerAdvice.ts', 'app/dashboard/scoreV2.ts', 'app/methodology/page.tsx'];

function visibleText(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/>([^<>{}\n][^<>{}]*)</g)) out.push(m[1]);        // JSX text
  for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n]){12,})\1/g)) out.push(m[2]); // string literals
  return out.map(s => s.trim()).filter(s => /[A-Za-z]{3}/.test(s) && !/^(use client|[./@#\w-]+\.(tsx?|css))$/.test(s));
}

describe('no advice or counterfactual wording in page copy', () => {
  for (const f of FILES) {
    it(f, () => {
      const hits = visibleText(readFileSync(join(process.cwd(), f), 'utf8'))
        .map(t => ({ t, hits: findAdviceTerms(t) })).filter(x => x.hits.length);
      expect(hits).toEqual([]);
    });
  }
  it('the exact strings seen on the deployed sample dashboard are not in any page source', () => {
    for (const f of FILES) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      for (const bad of KNOWN_BAD_STRINGS) expect(src).not.toContain(bad);
    }
  });
});
