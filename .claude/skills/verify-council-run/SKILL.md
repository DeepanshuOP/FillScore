---
name: verify-council-run
description: Prove that an Agent Council or eval run actually executed rather than silently degrading to default objects on Groq exhaustion. Use after any council run, consistency eval, or ablation, and before reporting any E1-E5 number.
---

# Verify a council / eval run really happened

**A council run that returns a plausible result proves nothing.** On Groq 429 exhaustion the pipeline
falls back to typed `_default_*()` verdicts and still returns a well-formed, sensible-looking object.
Every eval number produced before this check was invented turned out to be invalid at least once.

Run all four checks. Report each one's raw result. If any fails, the run is void — say so and do not
report its numbers.

## 1. Failure-string sweep

Grep the run's stdout/stderr and the persisted document for: `failed:`, `Max retries`, `_default_`,
`429`, `rate limit`. Report the match count for each string, including zeros. Zero matches across all
five is the only passing result.

## 2. Run status and call count

Load the persisted `council_runs` document and print `degraded`, `degraded_reasons`,
`n_calls_expected`, `n_calls_ok`, `cached` and `len(llm_calls)`. Passing means `degraded` is false,
`degraded_reasons` is empty and `n_calls_ok == n_calls_expected` (read the expected count from the
document; do not assume a fixed number). Each `llm_calls` record is one HTTP attempt
`{role, provider, model, attempt, latency_ms, tokens, outcome}`; report the outcomes and which
models actually served the run. A degraded run is never graded: if `degraded` is true the run is void.
If `cached` is true the run was replayed from an earlier identical run with zero LLM calls: it proves
nothing about the pipeline, so say so and don't count it as a fresh run.

## 3. Freshness

Print `user_id` and `created_at` from the persisted document. Confirm `created_at` is from this run,
not a replay of an older one. Remember `created_at` is an ISO-8601 **string** — query by prefix, not
by date object. A stale document narrated as fresh output has happened before.

## 4. Read the actual text

Print the real recommendation text and the real verdict strings. Read them. Generic filler
("consider optimizing your execution") indicates a degraded run even when the numbers look fine.
Aggregate metrics cannot detect this; only reading can.

## Reporting

Give the four raw results first, then the run's numbers. Never invert that order — the numbers are
meaningless until the four checks pass.

If reporting E1/E2/E3, also state `n` and the profile set, and frame results across the three demo
profiles as **descriptive, not a powered trend**.
