import { describe, it, expect, vi } from 'vitest';
import { resolveIdentityState } from './identityResolver';

describe('resolveIdentityState', () => {
  it('should return real mode state and clear storage for authenticated users', () => {
    const result = resolveIdentityState(null, 'demo-disciplined', 'valid-token');
    expect(result).toEqual({
      mode: 'real',
      effectiveUserId: null,
      shouldClearStorage: true,
      shouldSetStorage: false
    });
  });

  it('should return demo mode state and set storage for valid URL param', () => {
    const result = resolveIdentityState('demo-disciplined', null, null);
    expect(result).toEqual({
      mode: 'demo',
      effectiveUserId: 'demo-disciplined',
      shouldClearStorage: false,
      shouldSetStorage: true
    });
  });

  it('should return demo mode state and set storage for valid storage param', () => {
    const result = resolveIdentityState(null, 'demo-disciplined', null);
    expect(result).toEqual({
      mode: 'demo',
      effectiveUserId: 'demo-disciplined',
      shouldClearStorage: false,
      shouldSetStorage: true
    });
  });

  it('should return redirect mode state with default fallback if no identity is provided', () => {
    const result = resolveIdentityState(null, null, null);
    expect(result).toEqual({
      mode: 'redirect',
      effectiveUserId: null,
      shouldClearStorage: false,
      shouldSetStorage: false
    });
  });

  it('should return redirect mode state for invalid URL param', () => {
    const result = resolveIdentityState('invalid-user', null, null);
    expect(result).toEqual({
      mode: 'redirect',
      effectiveUserId: null,
      shouldClearStorage: false,
      shouldSetStorage: false
    });
  });
});
