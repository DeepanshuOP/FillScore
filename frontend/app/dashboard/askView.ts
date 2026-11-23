/**
 * View model for "Ask your execution" (M5). Pure. The answer text and the values come from POST /ml/agents/ask, where every number is a
 * stored measurement placed by code. Errors use fixed messages: the server's own text is never shown.
 */
import { councilErrorMessage } from '../utils/councilStatus';

export const ASK_COPY = {
  title: 'Ask about your past executions',
  hint: 'Questions about your score, what your orders cost and which orders cost the most. Answers use only your stored measurements.',
  button: 'Ask',
  placeholder: 'For example: which orders cost the most?',
} as const;

export interface AskApi {
  answer: string; tools_used: string[]; n_calls: number; degraded: boolean; fallback: string | null;
  values: Array<{ placeholder: string; shown: string }>;
  /** "claims" (ADR-0018, Ask only): the model chose claims, code wrote the sentence. Absent on a free-text answer. */
  answer_kind?: 'claims';
}
/** `byModel` is true when the sentence is the model's (it passed every check), false when code wrote it from the measured values.
 *  `byClaims` is true for an answer the model chose claims for and code wrote (ADR-0018): no model heading over it. */
export interface AskView { error: string | null; answer: string | null; meta: string | null; values: string[]; note: string | null; byModel: boolean; byClaims: boolean }

/** The one line over a claims answer: who chose what, who wrote the sentence. */
export const CLAIMS_LINE = 'The model chose which measured values to state; code wrote the sentence and placed the figures.'

/** One line when the model's answer was not used (sixth order, step 3). The server's own reason is never printed. */
export const DEGRADED_LINE = "The model's answer did not pass the checks, so code wrote this sentence from the measured values."

export function describeAsk(status: number, body: unknown): AskView {
  const none = { answer: null, meta: null, values: [], note: null, byModel: false, byClaims: false };
  if (status === 401) return { error: 'Sign in to ask a question about your own executions.', ...none };
  if (status === 429 || status === 503) {
    const code = (body as { detail?: { code?: string } } | null)?.detail?.code;
    return { error: councilErrorMessage(code), ...none };
  }
  if (status !== 200 || !body) return { error: 'The question could not be answered. Please try again.', ...none };
  const b = body as AskApi;
  const calls = `${b.n_calls} model call${b.n_calls === 1 ? '' : 's'}`;
  const claims = b.answer_kind === 'claims' && !b.degraded && b.tools_used.length > 0;
  return {
    error: null, answer: b.answer,
    // a degraded answer was written by code: the meta line says the model's text was not used, never a model name beside "no text"
    meta: b.degraded ? `Model calls: ${b.n_calls} · answer not used`
      : b.tools_used.length ? `Read: ${b.tools_used.join(', ')}. Used ${calls}.` : `No data was read. Used ${calls}.`,
    values: b.values.map(v => `${v.placeholder}: ${v.shown}`),
    note: b.degraded ? DEGRADED_LINE : claims ? CLAIMS_LINE : null,
    // a claims answer is code's sentence (the model chose the claims), so the language-model heading never shows over it
    byModel: !b.degraded && b.tools_used.length > 0 && !claims,
    byClaims: claims,
  };
}
