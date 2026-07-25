import { describe, it, expect } from 'vitest';
import { mapOnboardingError } from './errorMapping';

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

  it('maps 429 status code correctly', () => {
    expect(mapOnboardingError('any_code', 429)).toBe(
      "Too many attempts. Please wait a few minutes and try again."
    );
  });

  it('returns a fallback message for unknown errors', () => {
    expect(mapOnboardingError('something_weird')).toBe(
      "Something went wrong. Please try again."
    );
  });
});
