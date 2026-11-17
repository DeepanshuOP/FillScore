/**
 * View model for "Ask your execution" (M5). Pure. The answer text and the values come from POST /ml/agents/ask, where every number is a
 * stored measurement placed by code. Errors use fixed messages: the server's own text is never shown.
 */
import { councilErrorMessage } from '../utils/councilStatus';

export const ASK_COPY = {
  title: 'Ask about your past executions',
  hint: 'Questions about your score, what your orders cost and which orders cost the most. Answers use only your stored measurements.',
  button: 'ASK',
  placeholder: 'For example: which orders cost the most?',
} as const;

export interface AskApi {
  answer: string; tools_used: string[]; n_calls: number; degraded: boolean; fallback: string | null;
  values: Array<{ placeholder: string; shown: string }>;
}
export interface AskView { error: string | null; answer: string | null; meta: string | null; values: string[]; note: string | null }

export function describeAsk(status: number, body: unknown): AskView {
  const none = { answer: null, meta: null, values: [], note: null };
  if (status === 401) return { error: 'Sign in to ask a question about your own executions.', ...none };
  if (status === 429 || status === 503) {
    const code = (body as { detail?: { code?: string } } | null)?.detail?.code;
    return { error: councilErrorMessage(code), ...none };
  }
  if (status !== 200 || !body) return { error: 'The question could not be answered. Please try again.', ...none };
  const b = body as AskApi;
  const calls = `${b.n_calls} model call${b.n_calls === 1 ? '' : 's'}`;
  return {
    error: null, answer: b.answer,
    meta: b.tools_used.length ? `Read: ${b.tools_used.join(', ')} · ${calls}` : `No data was read · ${calls}`,
    values: b.values.map(v => `${v.placeholder}: ${v.shown}`),
    note: b.degraded && b.fallback ? `Written by code from the measured values, because ${b.fallback}.` : null,
  };
}
