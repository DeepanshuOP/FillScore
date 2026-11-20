import { describe, it, expect } from 'vitest';
import { describeAsk, ASK_COPY } from './askView';

// M5 "Ask your execution": the answer is shown with the values it used and how many model calls it took. A fallback answer says so.
const ok = (over = {}) => ({ mode: 'ask', answer: 'The measured score was A at 93.4.', tools_used: ['score'], n_calls: 2, degraded: false, fallback: null,
  values: [{ placeholder: 'score.grade', shown: 'A' }, { placeholder: 'score.composite_score', shown: '93.4' }], ...over });

describe('describeAsk', () => {
  it('shows the answer, the tools, the values it used and the calls it took', () => {
    const v = describeAsk(200, ok());
    expect(v.error).toBeNull();
    expect(v.answer).toBe('The measured score was A at 93.4.');
    expect(v.meta).toBe('Read: score. Used 2 model calls.');
    expect(v.values).toEqual(['score.grade: A', 'score.composite_score: 93.4']);
    expect(v.note).toBeNull();
  });
  it('a refusal (no tool) says how many calls were made and lists no values', () => {
    const v = describeAsk(200, ok({ answer: 'I can only answer ...', tools_used: [], n_calls: 1, values: [] }));
    expect(v.meta).toBe('No data was read. Used 1 model call.');
    expect(v.values).toEqual([]);
  });
  it('a code-built answer is labelled as such, with its reason', () => {
    const v = describeAsk(200, ok({ degraded: true, fallback: 'the answer could not be produced (RuntimeError)' }));
    expect(v.note).toBe('Written by code from the measured values, because the answer could not be produced (RuntimeError).');
  });
  it('errors use the shared messages; nothing from the server body is shown', () => {
    expect(describeAsk(429, { detail: { code: 'RATE_LIMIT_EXHAUSTED', message: 'x' } }).error)
      .toBe('The Council is at capacity right now. Please try again in a few minutes.');
    expect(describeAsk(500, { detail: 'stack trace here' }).error).toBe('The question could not be answered. Please try again.');
    expect(describeAsk(401, null).error).toBe('Sign in to ask a question about your own executions.');
  });
  it('the static copy has no advice, cause or call to action', () => {
    const bad = /\b(should|recommend\w*|consider|better to|ought|must|opportunit\w*|could (have|save)|saved|savings?|because|due to|caused by|worth)\b/i;
    for (const s of Object.values(ASK_COPY)) expect(s, s).not.toMatch(bad);
  });
});
