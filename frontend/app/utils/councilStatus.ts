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
    DEMO_NOT_GENERATED: 'Demo analysis not generated yet.',
};

/**
 * Turns a typed error code from the Council stream into user-facing copy. The server's own
 * message text is never shown, because exception strings can carry connection details.
 */
export function councilErrorMessage(code: string | undefined): string {
    return (code && COUNCIL_ERROR_MESSAGES[code]) || GENERIC_COUNCIL_ERROR;
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

/** "BTCUSDT · 82 trades" (the Council packet's scope; the dashboard covers every symbol). */
export function councilScopeLabel(symbol: string, tradeCount: number | null | undefined): string {
    if (typeof tradeCount !== 'number') return symbol;
    return `${symbol} · ${tradeCount.toLocaleString('en-US')} ${tradeCount === 1 ? 'trade' : 'trades'}`;
}

export interface CouncilAgentCard {
    agent: string;
    rating: string;
    valuesCited: number | null;   // placeholders the agent's text rendered (code-counted); null if not recorded
    severity: string;
    flags: string[];
    status: 'waiting' | 'running' | 'done';
    failed: boolean;
}

const RESULT_FIELDS: [agent: string, key: string, ratingField: string][] = [
    ['liquidity_scout', 'liquidity', 'liquidityRating'],
    ['alpha_architect', 'alpha', 'alphaRating'],
    ['risk_auditor', 'risk', 'riskLevel'],
    ['fee_optimizer', 'fee', 'feeRating'],
];

/** The four specialist cards rebuilt from the final Council result (the `complete` event). */
export function verdictCardsFromResult(result: Record<string, any>): Record<string, CouncilAgentCard> {
    const cards: Record<string, CouncilAgentCard> = {};
    for (const [agent, key, ratingField] of RESULT_FIELDS) {
        const v = result?.[key] ?? {};
        const flags: string[] = Array.isArray(v.flags) ? v.flags : [];
        cards[agent] = {
            agent,
            rating: v[ratingField] ?? '',
            valuesCited: typeof result?.grounding?.per_agent?.[agent]?.values_cited === 'number'
                ? result.grounding.per_agent[agent].values_cited : null,
            severity: v.severity ?? 'MEDIUM',
            flags,
            status: 'done',
            failed: flags.includes('agent_failed'),
        };
    }
    return cards;
}
