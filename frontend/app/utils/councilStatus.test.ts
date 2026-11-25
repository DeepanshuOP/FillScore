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
            'The AI review is temporarily unavailable. Please try again shortly.'
        );
    });

    it('returns a fallback when status is 503 and detail is whitespace-only', () => {
        expect(councilMaintenanceMessage(503, { detail: '   ' })).toBe(
            'The AI review is temporarily unavailable. Please try again shortly.'
        );
    });

    it('returns a fallback when status is 503 and body has no detail field', () => {
        expect(councilMaintenanceMessage(503, {})).toBe(
            'The AI review is temporarily unavailable. Please try again shortly.'
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
            'The AI review is at capacity right now. Please try again in a few minutes.'
        );
    });

    it('maps a database outage to a neutral message', () => {
        expect(councilErrorMessage('DB_UNAVAILABLE')).toBe(
            "The AI review can't reach its data right now. Please try again shortly."
        );
    });

    it('maps missing data to something actionable', () => {
        expect(councilErrorMessage('NO_DATA')).toBe(
            'There are no scored trades to analyse for this account yet.'
        );
    });

    it('maps a retired or missing AI model to a message that blames the configuration, not the user', () => {
        expect(councilErrorMessage('MODEL_UNAVAILABLE')).toBe(
            "The AI review's language model is unavailable right now. This is a configuration problem on our side, not yours."
        );
    });

    it('falls back to a generic message for unknown or missing codes', () => {
        const generic = 'The AI review hit an unexpected problem. Please try again.';
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
    councilVerdictView, flagLabel, councilScopeLabel,
    COUNCIL_DISCLAIMER,
    verdictCardsFromResult,
} from './councilStatus';

describe('councilVerdictView', () => {
    it('labels a complete run', () => {
        expect(councilVerdictView({ overallRating: 'GOOD', degraded: false })).toEqual({
            kind: 'graded', rating: 'GOOD',
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

});

describe('Phase 1b error codes', () => {
    it('explains the daily budget refusal', () => {
        expect(councilErrorMessage('DAILY_BUDGET_EXHAUSTED')).toBe(
            'The daily AI budget has been reached. Please try again tomorrow.'
        );
    });

    it('explains a demo analysis that has not been generated', () => {
        expect(councilErrorMessage('DEMO_NOT_GENERATED')).toBe('Demo analysis not yet generated for the current demo data.');
    });
});

describe('COUNCIL_DISCLAIMER', () => {
    it('frames the panel as a past-trade audit, not advice', () => {
        expect(COUNCIL_DISCLAIMER).toBe('Post-trade analysis of past executions, not financial advice.');
    });
});

describe('verdictCardsFromResult', () => {
    it('builds the four cards from the final result; values cited come from the grounding ledger, not the model', () => {
        const result = {
            liquidity: { liquidityRating: 'GOOD', confidence: 0.99, severity: 'LOW', flags: [] },
            alpha: { alphaRating: 'NEUTRAL', severity: 'LOW', flags: [] },
            risk: { riskLevel: 'LOW', severity: 'LOW', flags: [] },
            fee: { feeRating: 'MODERATE', severity: 'MEDIUM', flags: ['agent_failed'] },
            grounding: { per_agent: { liquidity_scout: { values_cited: 3 }, risk_auditor: { values_cited: 0 } } },
        };
        const cards = verdictCardsFromResult(result);
        expect(Object.keys(cards)).toEqual(['liquidity_scout', 'alpha_architect', 'risk_auditor', 'fee_optimizer']);
        expect(cards.liquidity_scout).toEqual({
            agent: 'liquidity_scout', rating: 'GOOD', severity: 'LOW',
            valuesCited: 3, flags: [], status: 'done', failed: false, finding: null, sentences: [], cited: null,
        });
        expect(cards.liquidity_scout).not.toHaveProperty('confidence');   // an LLM number is never shown
        expect(cards.risk_auditor.valuesCited).toBe(0);
        expect(cards.alpha_architect.valuesCited).toBeNull();             // older runs: not recorded, not "0"
        expect(cards.fee_optimizer.failed).toBe(true);
    });

    it('design v3 fixes A7: the recorded finding verbatim, flag sentences apart from tags, cited values from the server', () => {
        const text = 'The trader executed 77.9% of orders as maker, keeping total fee cost at $23.96 with a drag of 10.0 bps.';
        const lines = [{ value: '77.9%', unit: '%', fields: ['fee.maker_ratio'] }, { value: '$23.96', unit: 'USD', fields: ['fee.total_fee_paid_usd'] }];
        const result = {
            fee: { feeRating: 'OPTIMAL', severity: 'LOW', recommendedAction: text, flags: ['high_maker_participation'] },
            risk: { riskLevel: 'MEDIUM', severity: 'MEDIUM', flags: ['Adverse selection rate was 0.0% across 344 trades.', 'single_asset'] },
            liquidity: { liquidityRating: 'GOOD', slippageRoot: 'Liquidity verdict: GOOD.', flags: [] },
            alpha: { alphaRating: 'NEGATIVE', bestAlternative: 'Alpha verdict: NEGATIVE.', flags: [] },
            citedValues: {
                fee_optimizer: { recorded: 3, lines, complete: true },
                risk_auditor: { recorded: 4, lines: [], complete: false },
                liquidity_scout: { recorded: 3, lines: [], complete: true },
            },
        };
        const cards = verdictCardsFromResult(result);
        expect(cards.fee_optimizer.finding).toBe(text);                      // verbatim, never edited
        expect(cards.fee_optimizer.cited).toEqual({ complete: true, lines });
        expect(cards.risk_auditor.finding).toBeNull();                       // the risk auditor writes flags only
        expect(cards.risk_auditor.sentences).toEqual(['Adverse selection rate was 0.0% across 344 trades.']);
        expect(cards.risk_auditor.flags).toEqual(['single_asset']);          // tags stay chips
        expect(cards.risk_auditor.cited).toEqual({ complete: false, lines: [] });
        expect(cards.alpha_architect.cited).toBeNull();                      // not sent: the card falls back to the count
    });
});

describe('councilVerdictView has no letter grade (2c.A6)', () => {
    it('shows the label only for a complete run', () => {
        const v = councilVerdictView({ overallRating: 'GOOD', degraded: false });
        expect(v).toEqual({ kind: 'graded', rating: 'GOOD' });
        expect(JSON.stringify(v)).not.toMatch(/"grade"|"[A-F]"/);
    });
});

describe('flagLabel', () => {
    it('maps known tags and title-cases unknown ones', () => {
        expect(flagLabel('zero_market_orders')).toBe('No market orders');
        expect(flagLabel('single_symbol_concentration')).toBe('Single-symbol concentration');
        expect(flagLabel('high_taker_streak')).toBe('High Taker Streak');
        expect(flagLabel('Adverse selection occurred.')).toBe('Adverse selection occurred.');
    });

    it('has no "Stable regime" label (the Council no longer has a regime)', () => {
        expect(flagLabel('stable_regime')).not.toBe('Stable regime');
    });
});

describe('councilScopeLabel', () => {
    it('states symbol and trade count', () => {
        expect(councilScopeLabel('BTCUSDT', 82)).toBe('BTCUSDT · 82 trades');
        expect(councilScopeLabel('BTCUSDT', 1)).toBe('BTCUSDT · 1 trade');
        expect(councilScopeLabel('BTCUSDT', null)).toBe('BTCUSDT');
    });
});

import { councilScopeStatement, parseCouncilScope } from './councilStatus';
describe('Council scope statement (served counts, printed as they are)', () => {
    it('says how much of the account the one-symbol audit covers', () => {
        const scope = { symbol: 'BTCUSDT', symbolFills: 344, accountFills: 607 };   // demo-moderate: served counts
        expect(councilScopeStatement('BTCUSDT', scope)).toBe("BTCUSDT only: 344 of the account's 607 fills");
        expect(councilScopeStatement('BTCUSDT', { symbol: 'BTCUSDT', symbolFills: 1234, accountFills: 12345 }))
            .toBe("BTCUSDT only: 1,234 of the account's 12,345 fills");
    });
    it('does not say "only" when the symbol is the whole account', () => {
        expect(councilScopeStatement('BTCUSDT', { symbol: 'BTCUSDT', symbolFills: 82, accountFills: 82 }))
            .toBe("BTCUSDT: all 82 of the account's fills");
    });
    it('states no number without served counts', () => {
        expect(councilScopeStatement('BTCUSDT', null)).toBe('BTCUSDT only');
        expect(councilScopeStatement('BTCUSDT', null)).not.toMatch(/\d/);
    });
    it('reads the scope event and refuses anything that is not whole counts', () => {
        const ok = { scope: { symbol: 'BTCUSDT', symbolFills: 344, accountFills: 607 } };
        expect(parseCouncilScope(ok)).toEqual(ok.scope);
        expect(parseCouncilScope(null)).toBeNull();
        expect(parseCouncilScope({})).toBeNull();
        expect(parseCouncilScope({ scope: { symbol: 'BTCUSDT', symbolFills: '344', accountFills: 607 } })).toBeNull();
        expect(parseCouncilScope({ scope: { symbol: 'BTCUSDT', symbolFills: 3.5, accountFills: 607 } })).toBeNull();
        expect(parseCouncilScope({ scope: { symbol: 'BTCUSDT', symbolFills: -1, accountFills: 607 } })).toBeNull();
    });
});

// The Council panel must not render a letter grade; the only one on the page is the FillScore grade (2c.A6).
import { readFileSync } from 'node:fs';
describe('AgentCouncil panel source', () => {
    it('renders no grade glyph and carries the heading renamed by order of 2026-11-20', () => {
        const src = readFileSync(`${__dirname}/../components/AgentCouncil.tsx`, 'utf8');
        expect(src).not.toMatch(/view\.grade|overallToGrade|text-4xl/);
        expect(src).toContain('Explanation (language model; every number was checked against the audit)');
        expect(src).not.toContain('Council assessment');
        expect(src).not.toContain('Council Verdict');
        expect(src).not.toMatch(/Confidence|evidence keys/);
    });
    it('prints the word "Council" in no sentence a reader sees (design v5, PROPOSAL §1: it is the "AI review"); identifiers and comments may keep it', () => {
        for (const file of ['../components/AgentCouncil.tsx', './councilStatus.ts']) {
            const src = readFileSync(`${__dirname}/${file}`, 'utf8');
            const strings = [...src.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1|>([^<>{}\n]+)</g)].map((m) => m[2] ?? m[3] ?? '');
            const shown = strings.filter((s) => /\bCouncil\b/.test(s) && /\s/.test(s) && !/^\s*(import|from|\/\/)/.test(s));
            expect(shown, file).toEqual([]);
        }
    });
    it('uses no slate classes, hex colours, uppercase or animation of its own', () => {
        const src = readFileSync(`${__dirname}/../components/AgentCouncil.tsx`, 'utf8');
        expect(src).not.toMatch(/slate-|#[0-9a-fA-F]{3,6}\b|rgba?\(|uppercase|tracking-|animate-|transition-|violet-|emerald-|amber-|red-\d/);
    });
});

// ── 2026-11-20 display changes: labels and phrases only; stored keys are unchanged ──────────
import { agentLabel, ratingWords, alphaModelLabelNote, parseBenchmarkLine, alphaBenchmarkNote, flagText } from './councilStatus';

describe('agentLabel', () => {
    it('shows the alpha specialist as Benchmark Reviewer; the stored key stays alpha_architect', () => {
        // design v5 words (PROPOSAL §1): section headings Liquidity, Benchmark, Risk, Fees; the stored keys are unchanged
        expect(agentLabel('alpha_architect')).toBe('Benchmark');
        expect(agentLabel('liquidity_scout')).toBe('Liquidity');
        expect(agentLabel('risk_auditor')).toBe('Risk');
        expect(agentLabel('fee_optimizer')).toBe('Fees');
        expect(agentLabel('unknown_agent')).toBe('unknown_agent');
        expect(Object.keys(verdictCardsFromResult({ alpha: { alphaRating: 'NEUTRAL' } }))).toContain('alpha_architect');
    });
});

describe('ratingWords and the model label note', () => {
    it('writes a rating in words', () => {
        expect(ratingWords('SEVERELY_NEGATIVE')).toBe('severely negative');
        expect(ratingWords('POSITIVE')).toBe('positive');
        expect(ratingWords('')).toBe('');
    });
    it('shows the enum as the model\'s label, not as the verdict', () => {
        expect(alphaModelLabelNote('NEUTRAL')).toBe("Model's label, as recorded: neutral");
        expect(alphaModelLabelNote('SEVERELY_NEGATIVE')).toBe("Model's label, as recorded: severely negative");
        expect(alphaModelLabelNote('')).toBe('');
    });
});

describe('parseBenchmarkLine', () => {
    const statement = 'Market-order fills: median 1.2 bps worse than the 5-minute VWAP (88 fills)';
    it('prints the served sentence unchanged', () => {
        expect(parseBenchmarkLine({ benchmark: { state: 'measured', statement } })).toBe(statement);
    });
    it('prints no line for an account without a 5-minute VWAP (design v5, PROPOSAL §4 row 14, class a): the method note says why', () => {
        const s = 'Benchmark comparison: insufficient data (no market-order fill had a 5-minute VWAP)';
        expect(parseBenchmarkLine({ benchmark: { state: 'insufficient', statement: s } })).toBeNull();
    });
    it('is null when missing, null, of an unknown state or without a sentence', () => {
        expect(parseBenchmarkLine(null)).toBeNull();
        expect(parseBenchmarkLine({})).toBeNull();
        expect(parseBenchmarkLine({ benchmark: null })).toBeNull();
        expect(parseBenchmarkLine({ benchmark: { state: 'guess', statement } })).toBeNull();
        expect(parseBenchmarkLine({ benchmark: { state: 'measured', statement: '  ' } })).toBeNull();
        expect(parseBenchmarkLine({ benchmark: { state: 'measured' } })).toBeNull();
    });
});

describe('alphaBenchmarkNote', () => {
    // ml-service/agents/metrics/alpha_packet.py: deviation is against vwap5m, the 5-minute VWAP at execution, market orders only
    it('names the benchmark when there is one', () => {
        expect(alphaBenchmarkNote([])).toBe('Benchmark: the 5-minute volume-weighted average price (VWAP) at the time of each market order');
    });
    it('says in one sentence why there is no comparison when the run flagged that no VWAP benchmark was available (design v5, row 14)', () => {
        expect(alphaBenchmarkNote(['no_vwap_benchmark_available']))
            .toBe('No comparison with the 5-minute average price is shown: it needs five minutes of public trades around each market order, which this account’s data does not hold.');
    });
});

describe('flagText', () => {
    it('is sentence case for tags and leaves sentences alone', () => {
        expect(flagText('high_taker_streak')).toBe('High taker streak');
        expect(flagText('zero_market_orders')).toBe('No market orders');
        expect(flagText('Adverse selection occurred.')).toBe('Adverse selection occurred.');
    });
});
