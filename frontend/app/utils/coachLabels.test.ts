import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// M8 part 1 (2026-11-20): the dashboard's coach, insights and recommendation sections were removed in the rebuild (the
// order lists the sections of the new dashboard; none of these is among them). The test now asserts that none of the old
// labels, advice or unauthenticated-era copy is back. It used to assert that the descriptive labels EXECUTION PATTERNS,
// INSIGHTS, BEST-SCORING WINDOW and LOWEST-SCORING WINDOW were present.
// design v2: Headline, CostPanels and OrdersPanel were replaced by Overview and the section views; the scan follows them.
// design v5 step 6: Overview is removed; the scan follows the pages that replaced it (Costs and its tiles, Costliest orders, Home's Ask box)
// and keeps every file it scanned before, so the same fact (no coach, insights or advice labels) is asserted on the live layout.
const files = ['../dashboard/DashboardContent.tsx', '../dashboard/CostsView.tsx', '../dashboard/KpiTiles.tsx', '../dashboard/CostliestOrders.tsx', '../dashboard/AskHome.tsx',
  '../dashboard/OrdersView.tsx', '../dashboard/RulesView.tsx', '../dashboard/RankingsView.tsx', '../dashboard/OrderReplay.tsx'];
const src = files.map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n');

describe('dashboard labels', () => {
  it('the removed coach and insights sections are not back', () => {
    for (const label of ['EXECUTION PATTERNS', 'INSIGHTS', 'BEST-SCORING WINDOW', 'LOWEST-SCORING WINDOW']) {
      expect(src).not.toContain(label);
    }
  });
  it('has none of the old advice labels', () => {
    for (const old of ['ACTION PLAN', 'RECOMMENDATIONS', 'Your biggest opportunity', 'Trade around', 'historically scores', 'Route flow to', 'POTENTIAL SAVINGS']) {
      expect(src).not.toContain(old);
    }
  });
  it('has no unauthenticated-era copy', () => {
    expect(src).not.toMatch(/authenticated version/i);
  });
});
