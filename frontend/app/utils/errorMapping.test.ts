import { describe, it, expect } from 'vitest';
import { mapOnboardingError, refusalFollowUp } from './errorMapping';

describe('mapOnboardingError', () => {
  it('maps key_not_read_only correctly', () => {
    expect(mapOnboardingError('key_not_read_only')).toBe(
      "This key has trading or withdrawal permissions enabled. Create a new key with ONLY 'Enable Reading' turned on."
    );
  });

  it('maps invalid_key correctly', () => {
    expect(mapOnboardingError('invalid_key')).toBe(
      "Binance rejected this key. Check the key and secret are copied correctly and haven't expired."
    );
  });

  it('maps network_error correctly', () => {
    expect(mapOnboardingError('network_error')).toBe(
      "Couldn't reach Binance right now. Please try again in a moment."
    );
  });

  it('maps exchange_not_supported_yet correctly', () => {
    expect(mapOnboardingError('exchange_not_supported_yet')).toBe(
      "Only Binance is supported right now."
    );
  });

  it('maps any_code 429 correctly', () => {
    expect(mapOnboardingError('any_code', 429)).toBe(
      "Too many attempts. Please wait a few minutes and try again."
    );
  });

  it('maps no_trades_found correctly', () => {
    expect(mapOnboardingError('no_trades_found')).toBe(
      "We connected successfully, but found no spot trades in the last 30 days. FillScore analyses your executed trades — once you've traded, come back and sync."
    );
  });

  it('maps no_exchange_connections_found correctly', () => {
    expect(mapOnboardingError('no_exchange_connections_found')).toBe(
      "Connect an exchange first."
    );
  });

  it('maps invalid_or_expired_token correctly', () => {
    expect(mapOnboardingError('invalid_or_expired_token')).toBe(
      "This reset link is invalid or has expired. Request a new one."
    );
  });

  it('maps weak_password correctly', () => {
    expect(mapOnboardingError('weak_password')).toBe(
      "Password must be at least 8 characters."
    );
  });

  it('returns a fallback message for unknown errors', () => {
    expect(mapOnboardingError('something_weird')).toBe(
      "Something went wrong. Please try again."
    );
  });

  it('names the exchange in key and network errors when one is given', () => {
    expect(mapOnboardingError('invalid_key', 401, 'Bybit')).toBe(
      "Bybit rejected this key. Check the key and secret are copied correctly and haven't expired."
    );
    expect(mapOnboardingError('network_error', 502, 'OKX')).toBe(
      "Couldn't reach OKX right now. Please try again in a moment."
    );
  });

  it('describes a read-only failure in exchange-neutral terms', () => {
    expect(mapOnboardingError('key_not_read_only', 400, 'OKX')).toMatch(/read.?only/i);
  });

  it('maps passphrase_required', () => {
    expect(mapOnboardingError('passphrase_required')).toBe(
      "OKX needs the passphrase you set when you created the key."
    );
  });

  it('maps invalid_request to a field problem message', () => {
    expect(mapOnboardingError('invalid_request')).toBe(
      "Check that the key, secret and passphrase fields are filled in correctly."
    );
  });

  // Design v3 fixes A8 (2026-11-21): plain words from the same data ("Turned on: ... Needed: ... only."), the exchange's
  // "Enable " prefix dropped from its toggle names.
  it('names the permissions that were on and the one needed, per exchange, in plain words', () => {
    expect(mapOnboardingError('key_not_read_only', 400, 'Binance', { disable: ['Enable Spot & Margin Trading', 'Enable Withdrawals'], enable: ['Enable Reading'] }))
      .toBe('This key can do more than read your trades. Turned on: Spot & Margin Trading, Withdrawals. Needed: Reading only.');
    expect(mapOnboardingError('key_not_read_only', 400, 'Binance', { disable: ['Spot & Margin Trading', 'Withdrawals'] }))
      .toContain('Turned on: Spot & Margin Trading, Withdrawals.');
    expect(mapOnboardingError('key_not_read_only', 400, 'Bybit', { disable: ['Spot Trading', 'Withdrawals', 'Transfers'] }))
      .toContain('Turned on: Spot Trading, Withdrawals, Transfers.');
    expect(mapOnboardingError('key_not_read_only', 400, 'OKX', { disable: ['Trade', 'Withdraw'] }))
      .toContain('Turned on: Trade, Withdraw.');
    expect(mapOnboardingError('key_not_read_only', 400, 'Binance', { disable: [], enable: ['Reading'] }))
      .toContain('Needed: Reading only.');
    expect(mapOnboardingError('key_not_read_only', 400, 'Binance', { disable: ['Enable Withdrawals'] })).not.toMatch(/Disable:|Enable:/);
  });
});

describe('refusalFollowUp (design v3 fixes A8: the last correction matches what the form does)', () => {
  it('Binance: the corrections edit the same key, so the fields stay filled', () => {
    expect(refusalFollowUp('key_not_read_only', 'Binance')).toEqual({ keepFields: true, last: 'Press Connect again. Nothing from this attempt was stored.' });
  });
  it('Bybit and OKX: the corrections ask for a new key, so both fields are cleared and the key field takes focus', () => {
    for (const ex of ['Bybit', 'OKX']) {
      expect(refusalFollowUp('key_not_read_only', ex)).toEqual({ keepFields: false, last: 'Paste the new key and its secret here. Nothing from this attempt was stored.' });
    }
  });
  it('a key the exchange did not accept is pasted again on every exchange; no answer keeps the fields', () => {
    for (const ex of ['Binance', 'Bybit', 'OKX']) {
      expect(refusalFollowUp('invalid_key', ex)).toEqual({ keepFields: false, last: 'Paste the key and its secret again. Nothing from this attempt was stored.' });
      expect(refusalFollowUp('network_error', ex)).toEqual({ keepFields: true, last: 'Press Connect again. Nothing from this attempt was stored.' });
    }
  });
});
