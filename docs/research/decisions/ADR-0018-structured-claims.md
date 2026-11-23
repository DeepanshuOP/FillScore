# ADR-0018: Structured claims instead of free sentences (Accepted, Ask only)

- **Status:** **Accepted (Ask only)**, 2026-11-23, by Deepanshu (seventh order, Part B). The Council, the single-call synthesis and every recorded
  run stay as they are: the sections below the line "Original proposal" are the 2026-11-22 text, kept unchanged, and apply to the Council only
  as a proposal that is still not built. The section "Accepted scope: the Ask answer" is what was decided and built.
- **Date:** 2026-11-22 (proposal); 2026-11-23 (acceptance for Ask)
- **Phase:** Council honesty (fourth order, step 1); typed claims for Ask (seventh order, Part B)

## Accepted scope: the Ask answer (2026-11-23)

**What is decided.** The Ask answerer (`agents/ask.py`) stops writing sentences. It returns typed claims that name *which measured values to
state*, by value id, and never a digit; code validates them, formats every number with the existing formatter (`agents/render.format_value`),
and writes the sentence from a code-owned template. Any invalid claim sends the whole answer to the degraded path that exists today, unchanged
(`fallback_answer`: a code-built sentence over the tool values, `degraded: true`, the meta line "answer not used"). The free-text answer path
stays in the code as `mode="free"` so the two can be measured side by side (B3); production (`ask_service`) uses `mode="claims"`.

**Claim schema** (`agents/ask_claims.py`; JSON the model returns, nothing else):

```
{ "claims": [ { "claim_type": <one of 9 names>, "value_ids": [ "<id>", ... ] }, ... ] }     1 to 3 claims, no other key anywhere
```

`value_ids` are ids of the value catalog the model is shown (`costs.total_cost_usd`, `score.grade`, `costliest.orders.0.order_id`, the same
paths the placeholders use); a value is cited by id, so the model never writes a numeral. Code owns the closed list of `claim_type`s; each has
typed slots and one past-tense template. A slot's unit is read from the id's key name by the same suffix rule the formatter uses (`_usd`, `_bps`,
`_score`, `_count`, `grade`, `order_id`); an id of another unit than its slot is rejected (the old "bps in bps" failure becomes impossible: a
bps value cannot sit in a dollar slot and the unit word is part of the formatter's output, never of model text).

| claim_type | tool | slots (unit) | sentence (code-owned) |
|---|---|---|---|
| `SCORE_GRADE` | score | grade, score | The measured score was {grade} ({score} / 100). |
| `SCORE_RANGE` | score | score, score | The score's range ran from {low} to {high}. |
| `COST_TOTAL` | costs | usd | The measured orders cost {usd} in total. |
| `COST_MEDIAN` | costs | bps | The median order cost {bps}. |
| `COST_EXECUTION_MEDIAN` | costs | bps | The median execution cost was {bps}. |
| `FEES_TOTAL` | costs | usd | Fees came to {usd}. |
| `COSTLIEST_ORDER` | costliest | order, usd (same rank) | The costliest order was {id}, at {usd}. (rank 0); Order {id} was among the costliest, at {usd}. (other ranks) |
| `EXPECTED_COMPARE` | cost_vs_expected | bps, bps | Market orders cost {paid} against a modelled {expected}. |
| `EXPECTED_INTERVAL` | cost_vs_expected | bps, bps | The interval of paid minus modelled cost ran from {low} to {high}. (rules 1.0.0 said "The modelled cost's interval", which was wrong: the interval bounds the excess; found in review, fixed in 1.1.0) |

**Validation (all of it in code, none by the model):** the reply must parse as exactly this shape (any extra key, a free-text field or a wrong type
is *schema-invalid*); 1 to 3 claims (an empty list is invalid); each `claim_type` is in the table and its tool was run; `value_ids` has exactly the
slots' length; every id exists in the tool results and has the slot's unit; **from rules 1.1.0 each slot names its one exact id** (`SLOT_IDS` in
`agents/ask_claims.py`: a matching unit is not a matching meaning, so total fees cannot fill the total-cost slot and the ends of a range cannot swap;
reason `value_mismatch`); the two ids of an order claim are of the same rank; no claim repeats.
The templates are checked once at build time by a test that enumerates them (no digit, no forward-looking, advising or cause word; the same
lists as `agents/ask.py` and `agents/claims.py`). The order of the sentences is the order of the claims.

**Which model and API feature enforces it (checked 2026-11-23).** Groq's structured-outputs page
(<https://console.groq.com/docs/structured-outputs>, read 2026-11-23; the first ~40,000 of ~75,000 characters were read verbatim, the rest through a
summary that disagreed with the verbatim text on the model lists, so the verbatim text is used) lists under "Models with Strict Mode
(`strict: true`)" `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` and `meta-models/muse-spark-open`, "constrained decoding to
guarantee schema-compliant output"; and under "Best-effort Mode (`strict: false`)" the same four plus `openai/gpt-oss-safeguard-20b`
("may occasionally error", 400 on a schema mismatch). Request: `response_format: {type: "json_schema", json_schema: {name, strict: true,
schema}}`. Strict mode needs every field in `required` and `additionalProperties: false` on every object; enums are supported (the page's
example uses one). "Streaming and tool use are not currently supported with Structured Outputs": Ask uses neither. So **both models the
Ask answerer can be routed to (qwen3.8-27b first, gpt-oss-20b and gpt-oss-120b after it) support strict `json_schema`**; the router sends
`response_format` with `strict: true` to Groq candidates only (`LLMRouter.complete(..., response_format=...)`); a Gemini candidate gets the
prompt alone and is held to the same shape by the Pydantic check and by the validation above. Strict mode is a convenience (fewer invalid
replies); the safety does not rest on it, because every reply is validated in code whatever the provider did. Not checked: whether `maxItems`
is honoured in strict mode (the page does not mention it), so the 1 to 3 limit is enforced by the validator, not trusted to the API.

**Fallback on any validation failure.** Exactly today's degraded answer: `fallback_answer(used, ctx)` (code-built sentences over the tool values),
`degraded: true`, and `fallback` carrying the reason class (`schema_invalid`, `unknown_value_id`, `unit_mismatch`, `empty_claims`, ...). The UI line
and meta ("Model calls: n · answer not used") are unchanged. A failed or exhausted model call keeps today's behaviour. Calls: the planner call
and one claims call per question as before; the router's own retry on an invalid reply (`MAX_INVALID_REPLIES = 2` per candidate) is unchanged and
counted by B3 as live calls.

**Version bumps.** The Council's `PROMPT_VERSION` 1.8.0 and `CLAIM_RULES_VERSION` 1.4.0 are **not** moved (golden sets, recordings and
`test_golden_sets.py` pin them, and the Council is out of scope). Ask gets its own: `ASK_PROMPT_VERSION = "2.0.0"` (1.x = the free-text answerer,
which had no stamp; a major step because the output shape changed) and `ASK_CLAIM_RULES_VERSION` (the template table and the
validation above; a template change is a new version): 1.0.0 at the first build, **1.1.0** after the review of 2026-11-23 (exact ids per slot; the interval claim reworded). A result of the claims path stamps both and `answer_kind: "claims"`; a free-text result
stamps neither and has no `answer_kind`. Recorded fixtures keep the stamps they were made with.

**UI consequence (Ask only).** A claims answer is a sentence written by code from claims the model chose. The Ask slip says so ("Claims chosen by
the model; sentence and figures written by code") instead of presenting the sentence as the model's text; the language-model heading shows only
over free text, so for the claims path it does not appear. Figures are placed by code on both paths, as before (DESIGN section 12 rule 7).

**Cost and measurement.** Live calls only, $0 (free tier); Part B's cap is 60 live calls in total, usage counted in memory, nothing written to
Atlas, one wait for `Retry-After` on a 429 and then a stop. The comparison of the two paths is in `docs/research/LOG.md` and the README's
Evaluation section; the four Home answers are re-recorded with the new path as new fixture files beside the old ones.

## Original proposal (2026-11-22, unchanged; applies to the Council only, still not built)

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
