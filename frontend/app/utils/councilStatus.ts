const FALLBACK_MESSAGE = 'Agent Council is temporarily unavailable. Please try again shortly.';

export function councilMaintenanceMessage(status: number, body: unknown): string | null {
    if (status !== 503) return null;

    if (body && typeof body === 'object' && 'detail' in body) {
        const detail = (body as { detail?: unknown }).detail;
        if (typeof detail === 'string' && detail.trim().length > 0) {
            return detail;
        }
    }

    return FALLBACK_MESSAGE;
}

const GENERIC_COUNCIL_ERROR = 'The Council hit an unexpected problem. Please try again.';

const COUNCIL_ERROR_MESSAGES: Record<string, string> = {
    RATE_LIMIT_EXHAUSTED: 'The Council is at capacity right now. Please try again in a few minutes.',
    DB_UNAVAILABLE: "The Council can't reach its data right now. Please try again shortly.",
    NO_DATA: 'There are no scored trades to analyse for this account yet.',
    MODEL_UNAVAILABLE: "The Council's AI model is unavailable right now. This is a configuration problem on our side, not yours.",
    DAILY_BUDGET_EXHAUSTED: 'The daily AI budget has been reached. Please try again tomorrow.',
    DEMO_NOT_GENERATED: 'Demo analysis not yet generated for the current demo data.',
};

/**
 * Turns a typed error code from the Council stream into user-facing copy. The server's own
 * message text is never shown, because exception strings can carry connection details.
 */
export function councilErrorMessage(code: string | undefined, quickAvailable?: boolean): string {
    const base = (code && COUNCIL_ERROR_MESSAGES[code]) || GENERIC_COUNCIL_ERROR;
    // A refused Deep audit says plainly whether the cheaper Quick audit is still allowed (M3 §4); the text is ours.
    if (quickAvailable === true) return `${base} A Quick audit (one model call) is still available.`;
    if (quickAvailable === false) return `${base} A Quick audit is not available either.`;
    return base;
}

/** True only when the server said that a Quick audit would still be allowed after a Deep audit was refused. */
export function quickOffer(payload: { code?: string; quick_available?: boolean } | null | undefined): boolean {
    return payload?.quick_available === true;
}

/** "Quick audit · 1 model call" / "Deep audit · 9 model calls": the mode and the calls actually made. */
export function auditModeLabel(result: { mode?: string; n_calls_ok?: number; cached?: boolean; degraded?: boolean } & Record<string, unknown>): string {
    const quick = result?.mode === 'quick';
    const name = quick ? 'Quick audit' : 'Deep audit';
    if (result?.degraded) return `${name} · incomplete`;
    if (result?.cached) return `${name} · from an earlier identical audit, no new model call`;
    const n = Number(result?.n_calls_ok ?? 0);
    return `${name} · ${n} model call${n === 1 ? '' : 's'}`;
}

export function councilOfflineMessage(isDevelopment: boolean): string {
    if (isDevelopment) {
        return 'Agent Council service is offline. Start it with: cd ml-service && python -m uvicorn main:app --port 8000, then try again.';
    }
    return 'The Agent Council is offline right now. Please try again shortly.';
}

export const COUNCIL_DISCLAIMER = 'Post-trade analysis of past executions, not financial advice.';

const KNOWN_RATINGS = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL'];

export type CouncilVerdictView =
    | { kind: 'graded'; rating: string }
    | { kind: 'incomplete'; title: string; reasons: string[] };

/**
 * A degraded run (one where any agent, debate turn or the synthesis fell back to a default) is
 * never labelled: it shows "Analysis incomplete" and its reasons (F-06). A complete run shows the
 * Council's label only. The one letter grade on the page is the deterministic FillScore grade (2c.A6).
 */
export function councilVerdictView(synthesis: {
    overallRating?: string | null;
    degraded?: boolean;
    degraded_reasons?: string[];
}): CouncilVerdictView {
    const rating = (synthesis.overallRating ?? '').toUpperCase();
    if (synthesis.degraded || !KNOWN_RATINGS.includes(rating)) {
        return { kind: 'incomplete', title: 'Analysis incomplete', reasons: synthesis.degraded_reasons ?? [] };
    }
    return { kind: 'graded', rating };
}

const TAG_LABELS: Record<string, string> = {
    zero_market_orders: 'No market orders',
    single_symbol_concentration: 'Single-symbol concentration',
    agent_failed: 'Agent unavailable',
};

/** A specialist flag tag as a human label: a fixed map, else the tag title-cased. Sentences pass through. */
export function flagLabel(tag: string): string {
    if (TAG_LABELS[tag]) return TAG_LABELS[tag];
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(tag)) return tag;
    const words = tag.split('_').join(' ');
    return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Display names only. The stored keys (alpha_architect, alpha, alphaRating) are unchanged.
const AGENT_LABELS: Record<string, string> = {
    liquidity_scout: 'Liquidity Scout',
    alpha_architect: 'Benchmark Reviewer',
    risk_auditor: 'Risk Auditor',
    fee_optimizer: 'Fee Reviewer',   // display only (2026-11-22); recorded text that says "Fee Optimizer" is not edited
};

export function agentLabel(agent: string): string {
    return AGENT_LABELS[agent] ?? agent;
}

/** A stored rating in words: SEVERELY_NEGATIVE -> "severely negative". */
export function ratingWords(rating: string): string {
    return (rating ?? '').toLowerCase().split('_').join(' ');
}

/**
 * The model's benchmark label, as recorded. The enum has no defined direction (ml-service agents/schemas.py), so it is
 * shown as the model's word in a note and never as the verdict; the verdict line is the server's (`parseBenchmarkLine`).
 * Empty when there is no rating.
 */
export function alphaModelLabelNote(rating: string): string {
    const words = ratingWords(rating);
    return words ? `Model's label, as recorded: ${words}` : '';
}

/**
 * The server's benchmark statement (ml-service agents/benchmark_line.py, in the `cited_values` event): the market-order
 * fills' median against the 5-minute VWAP, with "better than", "worse than" or "equal to" decided by the server.
 * The page prints the served sentence and computes nothing; null when it is missing or malformed.
 */
export function parseBenchmarkLine(raw: unknown): string | null {
    const b = (raw as { benchmark?: { state?: unknown; statement?: unknown } | null } | null | undefined)?.benchmark;
    if (!b || (b.state !== 'measured' && b.state !== 'insufficient')) return null;
    return typeof b.statement === 'string' && b.statement.trim() ? b.statement : null;
}

/**
 * The benchmark the specialist compares against: `vwap5m`, the 5-minute volume-weighted average price at execution,
 * for market orders (ml-service/agents/metrics/alpha_packet.py). Shown only when the run did not flag its absence.
 */
export function alphaBenchmarkNote(flags: string[]): string {
    if (flags.includes('no_vwap_benchmark_available')) return '';
    return 'Benchmark: the 5-minute volume-weighted average price (VWAP) at the time of each market order';
}

/** A specialist flag in sentence case: the fixed labels, else the tag lower-cased with a capital first letter. */
export function flagText(tag: string): string {
    if (TAG_LABELS[tag]) return TAG_LABELS[tag];
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(tag)) return tag;
    const s = tag.split('_').join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "BTCUSDT · 82 trades" (the Council packet's scope; the dashboard covers every symbol). */
export function councilScopeLabel(symbol: string, tradeCount: number | null | undefined): string {
    if (typeof tradeCount !== 'number') return symbol;
    return `${symbol} · ${tradeCount.toLocaleString('en-US')} ${tradeCount === 1 ? 'trade' : 'trades'}`;
}

/** What the server's `scope` event says: the symbol the Council audited and the fill counts (both served). */
export interface CouncilScope {
    symbol: string;
    symbolFills: number;
    accountFills: number;
}

/** The scope event's payload as a CouncilScope, or null when it is missing or not made of whole counts. */
export function parseCouncilScope(raw: unknown): CouncilScope | null {
    const s = (raw as { scope?: Record<string, unknown> } | null | undefined)?.scope;
    if (!s || typeof s.symbol !== 'string' || !s.symbol) return null;
    const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
    return ok(s.symbolFills) && ok(s.accountFills)
        ? { symbol: s.symbol, symbolFills: s.symbolFills, accountFills: s.accountFills }
        : null;
}

/**
 * The Council's scope in one line, from the served counts: "BTCUSDT only: 344 of the account's 607 fills". Without
 * counts it still says the audit covers one symbol and states no number. The page computes nothing.
 */
export function councilScopeStatement(symbol: string, scope: CouncilScope | null): string {
    if (!scope) return `${symbol} only`;
    const n = (v: number) => v.toLocaleString('en-US');
    if (scope.symbolFills === scope.accountFills) return `${scope.symbol}: all ${n(scope.accountFills)} of the account's fills`;
    return `${scope.symbol} only: ${n(scope.symbolFills)} of the account's ${n(scope.accountFills)} fills`;
}

export interface CouncilAgentCard {
    agent: string;
    rating: string;
    valuesCited: number | null;   // placeholders the agent's text rendered (code-counted); null if not recorded
    severity: string;
    flags: string[];
    status: 'waiting' | 'running' | 'done';
    failed: boolean;
    /** Design v3 fixes A7: the specialist's recorded explanation, verbatim (null if it writes none). */
    finding?: string | null;
    /** Its flags that are sentences (shown verbatim as text); `flags` keeps the snake_case tags. */
    sentences?: string[];
    /** The values its text cites, traced by the server to the audit fields (citedValues); null when not sent. */
    cited?: { complete: boolean; lines: CitedLine[] } | null;
}

export interface CitedLine { value: string; unit: string; fields: string[] }

const RESULT_FIELDS: [agent: string, key: string, ratingField: string, textField: string | null][] = [
    ['liquidity_scout', 'liquidity', 'liquidityRating', 'slippageRoot'],
    ['alpha_architect', 'alpha', 'alphaRating', 'bestAlternative'],
    ['risk_auditor', 'risk', 'riskLevel', null],
    ['fee_optimizer', 'fee', 'feeRating', 'recommendedAction'],
];

const isSentence = (f: string) => /\s/.test(f.trim());

/** The four specialist cards rebuilt from the final Council result (the `complete` event). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the Council result is wide JSON from the ml-service; each field is read defensively below
export function verdictCardsFromResult(result: Record<string, any>): Record<string, CouncilAgentCard> {
    const cards: Record<string, CouncilAgentCard> = {};
    if (result?.mode === 'quick') return cards;          // a Quick audit has no specialists: no empty "done" cards
    for (const [agent, key, ratingField, textField] of RESULT_FIELDS) {
        const v = result?.[key] ?? {};
        const all: string[] = Array.isArray(v.flags) ? v.flags.filter((f: unknown) => typeof f === 'string') : [];
        const c = result?.citedValues?.[agent];
        cards[agent] = {
            agent,
            rating: v[ratingField] ?? '',
            valuesCited: typeof result?.grounding?.per_agent?.[agent]?.values_cited === 'number'
                ? result.grounding.per_agent[agent].values_cited : null,
            severity: v.severity ?? 'MEDIUM',
            flags: all.filter((f) => !isSentence(f)),
            status: 'done',
            failed: all.includes('agent_failed'),
            finding: textField && typeof v[textField] === 'string' && v[textField].trim() ? v[textField] : null,
            sentences: all.filter(isSentence),
            cited: c && typeof c.complete === 'boolean' && Array.isArray(c.lines) ? { complete: c.complete, lines: c.lines } : null,
        };
    }
    return cards;
}
