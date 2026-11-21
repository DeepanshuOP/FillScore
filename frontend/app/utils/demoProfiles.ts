export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface DemoProfile {
  id: string;
  exchange: string;
  exchangeLabel: string;
  exchangeColor: string;
  archetype: string;
  tagline: string;
  /** Canonical FillScore for the seeded account (ROADMAP section 2.1). Live data replaces it when available. */
  score: number;
}

export function gradeFromScore(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'demo-disciplined',
    exchange: 'binance',
    exchangeLabel: 'BINANCE',
    exchangeColor: '#F0B90B',
    // Design v3.1 fixes A3 (2026-11-22): the names state what differs between the three generated traders, read from
    // ml-service/demo_v2/decisions.py and the built orders (all 144 orders limit, 88% of fills 08-15 UTC), and imply no ranking.
    archetype: 'Limit orders, daytime',
    tagline: 'Every order a limit order, placed in the UTC daytime.',
    score: 95.88542572161496,
  },
  {
    id: 'demo-moderate',
    exchange: 'binance',
    exchangeLabel: 'BINANCE',
    exchangeColor: '#F0B90B',
    // built orders: 161 limit and 84 market of 245; 54% of fills 08-15 UTC, the rest across the evening
    archetype: 'Mixed orders, mixed hours',
    tagline: 'Limit and market orders, placed by day and in the evening (UTC).',
    score: 84.80888516669383,
  },
  {
    id: 'demo-aggressive',
    exchange: 'binance',
    exchangeLabel: 'BINANCE',
    exchangeColor: '#F0B90B',
    // built orders: 242 market and 69 limit of 311; 6% of fills 08-15 UTC (generator hours 21:00 to 03:59 UTC)
    archetype: 'Market orders, night',
    tagline: 'Mostly market orders, placed at night (UTC).',
    score: 60.67469266790485,
  },
];
// demo-bybit, demo-okx and demo-multi were removed from the product on 2026-11-13 (decision 8).
// demo-bybit returns in M6 with Bybit measurement.
