import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../../../backend/src/constants/adviceTerms';

// Scans the user-visible text (JSX text nodes and string literals) of the pages that render audit copy:
// dashboard coach/insights, Trade Journal (trades page) and the share card.
const FILES = ['app/dashboard/page.tsx', 'app/trades/page.tsx', 'app/share/[userId]/page.tsx', 'app/components/ConnectPrompt.tsx', 'app/utils/makerAdvice.ts',
  'app/dashboard/ScoreV2Panel.tsx', 'app/dashboard/scoreV2.ts', 'app/methodology/page.tsx'];

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
