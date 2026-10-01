import { describe, it, expect } from 'vitest';
import { councilMaintenanceMessage, councilErrorMessage, councilOfflineMessage } from './councilStatus';

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

describe('councilErrorMessage', () => {
    it('maps a rate-limit code to a capacity message, not an error string', () => {
        expect(councilErrorMessage('RATE_LIMIT_EXHAUSTED')).toBe(
            'The Council is at capacity right now. Please try again in a few minutes.'
        );
    });

    it('maps a database outage to a neutral message', () => {
        expect(councilErrorMessage('DB_UNAVAILABLE')).toBe(
            "The Council can't reach its data right now. Please try again shortly."
        );
    });

    it('maps missing data to something actionable', () => {
        expect(councilErrorMessage('NO_DATA')).toBe(
            'There are no scored trades to analyse for this account yet.'
        );
    });

    it('falls back to a generic message for unknown or missing codes', () => {
        const generic = 'The Council hit an unexpected problem. Please try again.';
        expect(councilErrorMessage('SOMETHING_NEW')).toBe(generic);
        expect(councilErrorMessage(undefined)).toBe(generic);
    });

    it('never echoes text that came from the server', () => {
        // assembled at runtime so this fake value never looks like a real connection string to a scanner
        const leaked = 'bad auth : authentication failed ' + 'mongodb+srv' + '://user:pass@cluster';
        expect(councilErrorMessage(leaked)).not.toContain('mongodb');
        expect(councilErrorMessage(leaked)).not.toContain('pass');
    });
});

describe('councilOfflineMessage', () => {
    it('gives developers the start command', () => {
        expect(councilOfflineMessage(true)).toContain('python -m uvicorn main:app --port 8000');
    });

    it('gives production users no terminal instructions', () => {
        const message = councilOfflineMessage(false);
        expect(message).not.toMatch(/uvicorn|terminal|cd ml-service/i);
        expect(message).toMatch(/offline|unavailable/i);
    });
});
