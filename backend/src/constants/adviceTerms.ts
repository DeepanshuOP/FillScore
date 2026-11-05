/**
 * Advice and counterfactual vocabulary. Mirrors ml-service/agents/claims.py
 * (COUNTERFACTUAL_TERMS and ADVICE_TERMS); keep the two lists in sync. FillScore audits the past:
 * no user-facing copy may tell the user what to do or what they "could have" saved.
 */
export const COUNTERFACTUAL_TERMS = [
    'avoidable', 'could have', 'would have', 'missed', 'saved', 'saving', 'savings',
    'opportunity', 'opportunities', 'might have', 'could save', 'would save', 'could cut',
    'would cut', 'could reduce', 'would reduce', 'could lower', 'would lower',
    'could avoid', 'would avoid', 'overpaid', 'wasted', 'unnecessary',
];
export const ADVICE_TERMS = [
    'should', 'recommend', 'recommends', 'recommended', 'recommendation', 'recommendations',
    'consider', 'better to', 'ought', 'must', 'needs to', 'need to', 'switch to',
];
/** Extra imperative / routing phrases seen in earlier copy (not in claims.py). */
export const EXTRA_ADVICE_PHRASES = [
    'saves you', 'route flow to', 'routing to', 'trade around', 'trading closer', 'shift trades', 'action plan',
];

const rx = (terms: string[]) => new RegExp(
    '(?<![A-Za-z])(?:' + [...terms].sort((a, b) => b.length - a.length).map(t => t.split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')).join('|') + ')(?![A-Za-z])', 'gi');
const ALL_RX = rx([...ADVICE_TERMS, ...COUNTERFACTUAL_TERMS, ...EXTRA_ADVICE_PHRASES]);

/** Distinct (lower-cased) advice/counterfactual terms found in text. */
export function findAdviceTerms(text: string): string[] {
    return [...new Set([...text.matchAll(ALL_RX)].map(m => m[0].toLowerCase().replace(/\s+/g, ' ')))];
}

/** Strings that were visible on the deployed sample dashboard after phase 2b. Must never be produced again. */
export const KNOWN_BAD_STRINGS = [
    'Your biggest opportunity: shift trades closer to your best window (~$1 over 31 days (modelled))',
    'Trade around 11:00 UTC',
    'Your worst-scoring trades cluster around 19:00 UTC. Trading closer to your best window (11:00 UTC) historically scores higher.',
];
