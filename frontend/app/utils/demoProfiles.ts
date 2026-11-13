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
    archetype: 'The Disciplined Trader',
    tagline: 'Limit orders. Trades 8–16 UTC. Minimal slippage.',
    score: 95.88542572161496,
  },
  {
    id: 'demo-moderate',
    exchange: 'binance',
    exchangeLabel: 'BINANCE',
    exchangeColor: '#F0B90B',
    archetype: 'The Moderate Trader',
    tagline: 'Mixed strategy. Average execution quality.',
    score: 84.80888516669383,
  },
  {
    id: 'demo-aggressive',
    exchange: 'binance',
    exchangeLabel: 'BINANCE',
    exchangeColor: '#F0B90B',
    archetype: 'The Aggressive Trader',
    tagline: 'Market orders. Night trading. High fee drag.',
    score: 60.67469266790485,
  },
];
// demo-bybit, demo-okx and demo-multi were removed from the product on 2026-11-13 (decision 8).
// demo-bybit returns in M6 with Bybit measurement.
