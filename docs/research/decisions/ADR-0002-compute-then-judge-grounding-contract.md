# ADR-0002: Compute-then-judge grounding contract

- **Status:** accepted
- **Date:** 2026-11-07 (documented retrospectively by the 2026-11 audit)
- **Phase:** AC-4/AC-5, 1c–3b.2

## Context
Product rule 2 (CLAUDE.md): an LLM never originates a number. Free-tier models invent or mis-copy numerals. Observed: gpt-oss-20b wrote "42.6% … {{key}}" (LOG §A).

## Decision
- **Deterministic code computes the numbers.** Python/TS builds every metric packet.
- **LLMs write placeholders.** They emit `{{namespace.key}}`; only `render.format_value` inserts values.
- **Stray numerals are handled in steps:** one regeneration, then sentence redaction, then a code-built fallback.
- **Counterfactual claims must pass a deterministic verifier** (ADR-0005).
- **A claim check flags** advice, causal and mechanism wording.

## Alternatives considered
- **Free-text LLM output plus post-hoc fact-checking:** misses paraphrased numbers.
- **Citations-style API grounding (T3.6):** provider-specific, and still lets the model copy numbers.

## Consequences
- **Good:** faithfulness 1.0 on the eval tables; mutation-tested invariants (LOG §A).
- **Limit:** the contract guarantees that numbers are *traceable*, not that they are *right*. The 2026-11 audit found that several inputs are heuristic, simulated or broken: the `spreadBps` collision, the `"STABLE"` regime placeholder, and forced-zero demo LIMIT slippage. The gate faithfully renders those values too.
- **Monitor** packet input provenance, not only grounding.
