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
  {
    id: 'demo-bybit',
    exchange: 'bybit',
    exchangeLabel: 'BYBIT',
    exchangeColor: '#F7A600',
    archetype: 'The Bybit Trader',
    tagline: 'Spot fills on Bybit, scored on the same four components.',
    score: 76.16413408878628,
  },
  {
    id: 'demo-okx',
    exchange: 'okx',
    exchangeLabel: 'OKX',
    exchangeColor: '#1E8FFF',
    archetype: 'The OKX Trader',
    tagline: 'Spot fills on OKX, scored on the same four components.',
    score: 81.6589477402669,
  },
  {
    id: 'demo-multi',
    exchange: 'multi',
    exchangeLabel: 'MULTI',
    exchangeColor: '#2dd4bf',
    archetype: 'The Multi-Exchange Trader',
    tagline: 'Trades across Binance, Bybit, and OKX. Compare venue alpha and execution quality.',
    score: 70.71963854879698,
  },
];
