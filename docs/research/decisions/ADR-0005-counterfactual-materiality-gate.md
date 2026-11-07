# ADR-0005: Counterfactual materiality gate, effect > max($1, 0.5% of fees)

- **Status:** accepted
- **Date:** 2026-11-07 (documented retrospectively by the 2026-11 audit)
- **Phase:** 1c, retained in 4a

## Context
- The Council may only state a counterfactual ("avoidable", "saved") for an action that passed deterministic verification (LOG §A).
- Small or noisy effects would otherwise become findings.

## Decision
- **What the verifier does:** it replays the trader's own trades under an action: maker instead of taker, excluding hours, venue shift, or smaller clips.
- **When an action passes:** only if `effect_usd > max($1, 0.5% of total fees)`, plus duplicate and contradiction checks.
- **On failure:** one forced re-reason, then the claim is dropped.
- **4a maker counterfactual formula:** `net = N·(taker−maker) + N·min(halfSpread, 1 bp) − adverse` per converted fill, and `effect = 0.5 × Σnet` (fill-probability haircut).

## Alternatives considered
- **No gate:** LLM-stated savings with no floor.
- **A statistical test per action:** sample sizes too small (n of about 50–300 synthetic fills).

## Consequences
- **Result on the demo accounts:** no account clears the gate in 4a (REPORT_phase4a §6). demo-aggressive's maker conversion is negative (−$0.38 / −$1.06) because of measured adverse selection.
- **The haircut (0.5) and the cap are assumptions,** not measurements.
- **The gate protects against false positives** even when the spread input is overstated (ADR-0004).
- **Revisit** once real accounts exist and the fill probability can be measured from the trader's own limit orders.
