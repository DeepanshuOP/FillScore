import { describe, it, expect } from 'vitest';
import { councilMaintenanceMessage } from './councilStatus';

describe('councilMaintenanceMessage', () => {
    it('returns the body detail when status is 503 and detail is a non-empty string', () => {
        expect(councilMaintenanceMessage(503, { detail: 'Groq quota exhausted, back at 00:00 UTC' })).toBe(
            'Groq quota exhausted, back at 00:00 UTC'
        );
    });

    it('returns a fallback when status is 503 and body is null', () => {
        expect(councilMaintenanceMessage(503, null)).toBe(
            'Agent Council is temporarily unavailable. Please try again shortly.'
        );
    });

    it('returns a fallback when status is 503 and detail is whitespace-only', () => {
        expect(councilMaintenanceMessage(503, { detail: '   ' })).toBe(
            'Agent Council is temporarily unavailable. Please try again shortly.'
        );
    });

    it('returns a fallback when status is 503 and body has no detail field', () => {
        expect(councilMaintenanceMessage(503, {})).toBe(
            'Agent Council is temporarily unavailable. Please try again shortly.'
        );
    });

    it('returns null when status is not 503', () => {
        expect(councilMaintenanceMessage(500, { detail: 'some error' })).toBeNull();
        expect(councilMaintenanceMessage(200, { detail: 'ok' })).toBeNull();
    });
});
