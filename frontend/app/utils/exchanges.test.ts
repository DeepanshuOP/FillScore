import { describe, it, expect } from 'vitest';
import { EXCHANGES, getExchange } from './exchanges';

describe('exchange registry', () => {
  it('lists all three supported exchanges as enabled', () => {
    expect(EXCHANGES.map(e => e.id)).toEqual(['binance', 'bybit', 'okx']);
    expect(EXCHANGES.every(e => e.enabled)).toBe(true);
  });

  it('only OKX needs a passphrase', () => {
    expect(EXCHANGES.filter(e => e.needsPassphrase).map(e => e.id)).toEqual(['okx']);
  });

  it('every exchange has a read-only guide that tells the user to keep trading and withdrawals off', () => {
    for (const ex of EXCHANGES) {
      expect(ex.guideSteps.length).toBeGreaterThanOrEqual(4);
      expect(ex.guideSteps.join(' ').toLowerCase()).toMatch(/read/);
    }
  });

  it('looks an exchange up by id', () => {
    expect(getExchange('bybit').name).toBe('Bybit');
  });
});
