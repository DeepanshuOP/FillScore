import { describe, it, expect } from 'vitest';
import { describeHeaderStats, tradesCardCopy } from './headerStats';

// A rebuilt demo: the stored audit says 248 trades / $44,650.63 / 66% (the deleted trades); the account now has
// 607 fills in 245 orders. The header copies the current figures (API `current`), and labels fills against orders.
const audit = { totalTrades: 248, totalNotional: 44650.63, breakdown: { makerRatio: 0.66 } };

describe('describeHeaderStats', () => {
  it('uses the current fills and orders when the API sends them', () => {
    const h = describeHeaderStats(audit, { fills: 607, orders: 245, notionalUsd: 1234567.891, makerRatio: 0.6612 });
    expect(h).toEqual({
      tradesLabel: 'FILLS ANALYSED', trades: '607', tradesSub: 'in 245 orders',
      volume: '$1,234,567.89', volumeSub: 'notional of all fills',
      makerRatio: '66%', makerSub: 'of fills',
    });
    expect(JSON.stringify(h)).not.toContain('248');
    expect(JSON.stringify(h)).not.toContain('44,650');
  });
  it('a current value that is null reads "not computed", never 0', () => {
    const h = describeHeaderStats(audit, { fills: 0, orders: 0, notionalUsd: null, makerRatio: null });
    expect(h.volume).toBe('not computed');
    expect(h.makerRatio).toBe('not computed');
  });
  it('without a current block (an account with v1 trades) the audit figures stay', () => {
    expect(describeHeaderStats(audit, undefined)).toEqual({
      tradesLabel: 'TRADES ANALYSED', trades: '248', tradesSub: 'across all symbols',
      volume: '$44,650.63', volumeSub: 'notional traded', makerRatio: '66%', makerSub: '',
    });
  });
});

describe('tradesCardCopy', () => {
  it('v1 scores exist: the old subtitle holds', () => {
    expect(tradesCardCopy(true).subtitle).toBe('Sortable table · Per-trade scores · Full breakdown');
  });
  it('rebuilt demo: no per-trade scores are promised', () => {
    const c = tradesCardCopy(false);
    expect(c.title).toBe('See every fill');
    expect(c.subtitle).toBe('Sortable table · Price, size and fee of each fill · Per-trade scores not computed for this data');
    expect(c.subtitle).not.toMatch(/Per-trade scores ·/);
  });
});
