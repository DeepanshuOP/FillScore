import { describe, it, expect } from 'vitest';
import { auditModeLabel, councilErrorMessage, verdictCardsFromResult, quickOffer } from './councilStatus';

// M3 §3 and §4: the Quick audit (one model call, the default) and the Deep audit (the 9-call Council, opt-in).
describe('auditModeLabel', () => {
    it('names the mode and the number of model calls actually made', () => {
        expect(auditModeLabel({ mode: 'quick', n_calls_ok: 1 })).toBe('Quick audit · 1 model call');
        expect(auditModeLabel({ mode: 'quick', n_calls_ok: 2 })).toBe('Quick audit · 2 model calls');
        expect(auditModeLabel({ n_calls_ok: 9, liquidity: {} })).toBe('Deep audit · 9 model calls');
    });
    it('says when the result came from an earlier identical audit (no call made now)', () => {
        expect(auditModeLabel({ mode: 'quick', n_calls_ok: 1, cached: true })).toBe('Quick audit · from an earlier identical audit, no new model call');
        expect(auditModeLabel({ n_calls_ok: 9, cached: true, liquidity: {} })).toBe('Deep audit · from an earlier identical audit, no new model call');
    });
    it('a degraded run is not presented as a complete audit', () => {
        expect(auditModeLabel({ mode: 'quick', n_calls_ok: 0, degraded: true })).toBe('Quick audit · incomplete');
    });
});

describe('a refused Deep audit offers the Quick audit, or says it cannot', () => {
    it('adds the offer to the message', () => {
        expect(councilErrorMessage('RATE_LIMIT_EXHAUSTED', true))
            .toBe('The Council is at capacity right now. Please try again in a few minutes. A Quick audit (one model call) is still available.');
        expect(councilErrorMessage('DAILY_BUDGET_EXHAUSTED', false))
            .toBe('The daily AI budget has been reached. Please try again tomorrow. A Quick audit is not available either.');
    });
    it('adds nothing when the server did not say', () => {
        expect(councilErrorMessage('RATE_LIMIT_EXHAUSTED')).toBe('The Council is at capacity right now. Please try again in a few minutes.');
    });
    it('quickOffer is true only when the server said so', () => {
        expect(quickOffer({ code: 'RATE_LIMIT_EXHAUSTED', quick_available: true })).toBe(true);
        expect(quickOffer({ code: 'RATE_LIMIT_EXHAUSTED', quick_available: false })).toBe(false);
        expect(quickOffer({ code: 'RATE_LIMIT_EXHAUSTED' })).toBe(false);
    });
});

describe('a Quick result has no specialist cards', () => {
    it('returns none, instead of four empty "done" cards', () => {
        expect(verdictCardsFromResult({ mode: 'quick', synthesis: {} })).toEqual({});
    });
    it('a Deep result keeps its four', () => {
        expect(Object.keys(verdictCardsFromResult({ liquidity: {}, alpha: {}, risk: {}, fee: {} }))).toHaveLength(4);
    });
});
