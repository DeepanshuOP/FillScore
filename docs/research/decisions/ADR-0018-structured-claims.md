# ADR-0018: Structured claims instead of free sentences (proposal, not built)

- **Status:** proposed (nothing in this ADR is implemented; no code, prompt, golden set or UI changed)
- **Date:** 2026-11-22
- **Phase:** Council honesty (fourth order, step 1)

## Context

Every number a user sees comes from code. The model writes sentences with `{{namespace.key}}` placeholders, code fills them
(`agents/render.py`), `agents/grounding.py` rejects any numeral the renderer did not produce (one regeneration, then sentence
redaction, then a code-built fallback sentence), and `agents/claims.py` removes causal wording after the fact.

The compliance table in `README.md` ("Evaluation", command `python ml-service/evals/placeholder_compliance.py`, 36 recordings and
3 demo runs, one agent output as the unit) measures how often that machinery has to step in:

| Role (model as recorded) | Written as the model wrote it | Regenerated | Code fallback | Numeral redactions | Claim-rule redactions |
|---|---|---|---|---|---|
| Specialists, council (qwen3.8-27b, 76 outputs) | 69.7% | 10.5% | 19.7% | 7 | 14 |
| Debate (gpt-oss-20b, 42 outputs) | 61.9% | 35.7% | 2.4% | 8 | 158 |
| Synthesis, council (qwen3.8-27b, 20 outputs) | 10.0% | 75.0% | 15.0% | 18 | 7 |
| Synthesis, single call (qwen3.8-27b, 18 outputs) | 16.7% | 83.3% | 0.0% | 8 | 0 |

Synthesis text is almost never used as first written, and the debate roles lose 158 sentences to the claim rules. The cause is
that the model is asked for free prose that must also obey two grammars (placeholders for numbers, no causal or advisory wording).
Both are checked after the fact, by pattern, on sentences that were already written. A pattern check can miss a phrasing
(rules 1.2.0, 1.3.0 and 1.4.0 each added terms after a run stated a cause), and it costs a regeneration or a deleted sentence when it fires.

Already structured today: the verdict enums (`schemas.py`), `cited_evidence`, and the debate's `claims[]` with `evidence_keys`
(`agents/debate.py:40`, `:72`). The free parts are `slippageRoot`, `bestAlternative`, `recommendedAction`, `flags[]`, the debate
summaries, and the synthesis `headline`, `narrative` and `observations`.

## Decision (proposed)

A specialist, a debater and the synthesis return **typed claims**, and code writes the sentences:

```
Claim { claim_type: enum,            # a closed list owned by code, e.g. FEE_DRAG_LEVEL, MAKER_SHARE, SLIPPAGE_LEVEL,
                                     #   VWAP_DEVIATION, REVERSION, HOUR_CONCENTRATION, ADVERSE_RATE, UNFILLED_COST
        verdict: enum,               # per claim_type, a closed list, e.g. {LOW, TYPICAL, HIGH} or {BETTER, EQUAL, WORSE}
        evidence_keys: list[str] }   # packet keys; each must exist in the agent's packet
```

- **Validation (Pydantic).** `claim_type` and `verdict` are `Literal`s; a validator rejects an `evidence_keys` entry that is not a key of the
  agent's packet, a `claim_type` the agent's role may not make, a verdict the claim type does not define, and a claim that cites no key.
  A failed validation is one regeneration with the validator's message, then the claim is dropped (never repaired by guessing).
- **Rendering.** Code owns one past-tense sentence template per `(claim_type, verdict)`, filled from the cited keys through the existing
  renderer, so the number, its unit and its sign come from code (as now) and the **words around it** come from code too. No model
  sentence reaches the user for a typed claim. Templates are reviewed once, against invariants I1 to I8 (past tense, no advice, no cause).
- **What stays free.** At most one optional short note per agent, still under placeholders, grounding and claim rules (so the existing
  machinery remains as a fallback path, not the main path). Synthesis keeps a conflict ledger; its `headline` and `narrative` become a
  fixed arrangement of the agents' rendered claims, ordered by a code rule, so synthesis stops writing prose over them.

### What changes

- **Prompts.** Each specialist prompt lists its allowed `claim_type`s with their verdict enums and says "return claims, no sentences".
  The prompt version moves to 2.0.0 (a major step, because every output shape changes). The placeholder and no-causation paragraphs
  shrink to the optional note.
- **Golden sets.** A new set `v5` (packets only until recorded, like v4). Packet hashes do not change (metrics unchanged) but the
  output schema does, so v1 to v4 stay pinned to their versions and remain readable by the old schema; `test_golden_sets.py` pins them by name.
  Invariants gain a typed-claim check: every claim cites a key that exists, and `required_evidence` is satisfied by claims, not by
  searching rendered text.
- **Claim rules.** Rules 1.4.0 stay for the optional note and for the debate's remaining free text. For typed claims they are replaced by a
  test over the template table (no template may contain a causal or advisory term; a unit test enumerates every template), which is a
  check done once at build time instead of on every run.
- **UI.** The Council notes render from the same sentences as today, so a typed claim looks like a note. The cited-values fold
  ("CITED FROM THE AUDIT") is built from `evidence_keys` directly instead of parsing placeholders from rendered text. The model's
  enum label is shown in the note as "model's label, as recorded".
- **Expected effect on the compliance table** (a hypothesis to be measured, not a result): for typed claims the "regenerated" and "numeral redaction" columns should fall to zero
  by construction, because the model emits no numeral; "claim-rule redactions" for typed claims should fall to zero for the same reason. The
  failure moves to a new column (schema-invalid claims: bad key, bad verdict), and `placeholder_compliance.py` gains that column. The risk is
  the opposite one: fixed templates may read as monotone, and a closed claim list can omit something a free sentence would have said.

### Cost to re-record

Live calls only; the LLM budget is $0 (free tiers) and the live-run allowance is the constraint (the third order used 4 of 5 runs).
One Deep council run is 9 model calls (`n_calls_expected` 9 in every council recording), so: the three demo fixtures are 3 runs, 27 calls;
a recorded golden set of the same size as v3 (3 traders x 6 runs, council arm) is 18 runs, 162 calls, plus the single-call arm; each
re-record of any prompt change repeats it. Wall time per run in the 15 council recordings that store `wall_s`: 59.5 s to 129.8 s, median 101.4 s.
Recorded output is never edited, so a template change after recording changes only the rendering, not the recorded claims, which is one
reason to keep recorded claims and rendered sentences apart.

## Alternatives considered

- **Keep free prose, add more claim-rule terms.** Cheap, and the rules have grown that way (1.2.0, 1.3.0, 1.4.0), but each new rule is
  written after a run slipped through, and the synthesis row above shows the regeneration cost is already highest where prose is longest.
- **Constrained decoding of sentences against a grammar.** Not available uniformly across the free-tier providers in `llm_routes.yaml`.
- **A second model that rewrites flagged sentences.** Adds calls and a new place for a model to originate wording (and numbers).

## Consequences

- Easier: the correlation-not-causation and past-tense rules become properties of a reviewed template table. A new causal phrasing cannot
  come from the model for a typed claim. The cited-evidence view is exact.
- Harder: a template table to write and review; the prose becomes more uniform; the synthesis loses some fluency.
- Monitor: the compliance table with the schema-invalid column; the share of runs where a specialist returns no valid claim.
- Revisit if: schema-invalid claims exceed the old regeneration rate, or reviewers find the rendered notes less informative than the free ones.
- Nothing here touches Scoring v1, any locked grade, any recorded Council output or any number shown to a user.
