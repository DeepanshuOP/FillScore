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

    it('maps a retired or missing AI model to a message that blames the configuration, not the user', () => {
        expect(councilErrorMessage('MODEL_UNAVAILABLE')).toBe(
            "The Council's AI model is unavailable right now. This is a configuration problem on our side, not yours."
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

// ── Phase 1b: degraded runs are never graded; new refusal codes; disclaimer ──────────
import {
    councilVerdictView,
    overallToGrade,
    COUNCIL_DISCLAIMER,
    verdictCardsFromResult,
} from './councilStatus';

describe('councilVerdictView', () => {
    it('grades a complete run', () => {
        expect(councilVerdictView({ overallRating: 'GOOD', degraded: false })).toEqual({
            kind: 'graded', grade: 'B', rating: 'GOOD',
        });
    });

    it('never shows a grade letter for a degraded run, even if a rating slipped through', () => {
        const view = councilVerdictView({
            overallRating: 'FAIR',
            degraded: true,
            degraded_reasons: ['liquidity_scout: fell back to a default verdict because the daily AI budget was used up'],
        });
        expect(view.kind).toBe('incomplete');
        expect(view).not.toHaveProperty('grade');
        expect(view).toEqual({
            kind: 'incomplete',
            title: 'Analysis incomplete',
            reasons: ['liquidity_scout: fell back to a default verdict because the daily AI budget was used up'],
        });
    });

    it('treats a missing rating as incomplete rather than a "?" grade', () => {
        expect(councilVerdictView({ overallRating: null }).kind).toBe('incomplete');
    });

    it('maps ratings to letters', () => {
        expect(['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL'].map(overallToGrade)).toEqual(['A', 'B', 'C', 'D', 'F']);
    });
});

describe('Phase 1b error codes', () => {
    it('explains the daily budget refusal', () => {
        expect(councilErrorMessage('DAILY_BUDGET_EXHAUSTED')).toBe(
            'The daily AI budget has been reached. Please try again tomorrow.'
        );
    });

    it('explains a demo analysis that has not been generated', () => {
        expect(councilErrorMessage('DEMO_NOT_GENERATED')).toBe('Demo analysis not generated yet.');
    });
});

describe('COUNCIL_DISCLAIMER', () => {
    it('frames the panel as a past-trade audit, not advice', () => {
        expect(COUNCIL_DISCLAIMER).toBe('Post-trade analysis of past executions, not financial advice.');
    });
});

describe('verdictCardsFromResult', () => {
    it('builds the four cards from the final result, using its deterministic confidence', () => {
        const result = {
            liquidity: { liquidityRating: 'GOOD', confidence: 0.0556, severity: 'LOW', cited_evidence: ['avg_slippage_bps'], flags: [] },
            alpha: { alphaRating: 'NEUTRAL', confidence: 0.1, severity: 'LOW', cited_evidence: [], flags: [] },
            risk: { riskLevel: 'LOW', confidence: 0, severity: 'LOW', cited_evidence: ['x', 'y'], flags: [] },
            fee: { feeRating: 'MODERATE', confidence: 0, severity: 'MEDIUM', cited_evidence: [], flags: ['agent_failed'] },
        };
        const cards = verdictCardsFromResult(result);
        expect(Object.keys(cards)).toEqual(['liquidity_scout', 'alpha_architect', 'risk_auditor', 'fee_optimizer']);
        expect(cards.liquidity_scout).toEqual({
            agent: 'liquidity_scout', rating: 'GOOD', confidence: 0.0556, severity: 'LOW',
            cited_evidence_count: 1, flags: [], status: 'done', failed: false,
        });
        expect(cards.risk_auditor.cited_evidence_count).toBe(2);
        expect(cards.fee_optimizer.failed).toBe(true);
    });
});
