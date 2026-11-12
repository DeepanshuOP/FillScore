# Experiments

Each entry follows the same template. Raw outputs stay in the repo (or in a run id that can be looked up), never only in a chat.

```
## EXP-NNN: <title>  [phase, date]
- Question:
- Setup (data, models, prompt versions, sample size):
- Exact command(s):
- Results (numbers, with where they live):
- Limitations:
- Status: done | superseded by EXP-NNN
```

## EXP-001: 9-call Council vs single call  [3b.2, Nov 2026]
- **Question:** under the same grounding, claim check and verification pipeline, does a 9-call multi-agent Council beat one LLM call?
- **Setup:** 3 synthetic demo users × 3 runs per arm; prompt 1.5.0 for the Council; its own single-call prompt with no specialist wording; free-tier routes; `persist=False`.
- **Commands:** `python -m evals.live_eval …` (see `ml-service/evals/live_eval.py`), then `python evals/ablation.py` (`--check` verifies byte-for-byte regeneration).
- **Golden set:** EXP-001 corresponds to golden v1 (`ml-service/evals/golden/v1/`) and prompt v1.5.0 (single-call prompt 1.0.0, metrics 1.1.0). `ablation.py --check` verifies it against v1 only. A repeat on v2 (prompt 1.6.0) is planned after 4R-2.
- **Results:** `ml-service/evals/ablation_results.md`; summary in LOG.md §B.
- **Limitations:** n=3 per user, synthetic users, free models, no ground-truth ratings.
- **Status:** done. A larger re-run is planned (≥10 runs per user, more profiles, real users).

## EXP-002: Spread-aware maker counterfactual on the demo accounts  [4a, Nov 2026]
- **Question:** does the counterfactual find material savings once spread and adverse selection are counted?
- **Setup:** 6 demo accounts, enriched offline with real data.binance.vision 1s klines; targets 0.5 and 0.8; haircut 0.5; half-spread cap 1.0 bp.
- **Command:** `python scripts/demo_counterfactual_report.py` (read-only).
- **Results:** none clears $1; demo-aggressive is negative (−$0.385 and −$1.061). See LOG.md §C.
- **Limitations:** synthetic trades; spread estimators likely overstate liquid-pair spreads.
- **Status:** done.

## EXP-003: Whale "adverse" re-run with only pre-fill bursts counted  [M2, 2026-11-12]
- **Question:** the stored `whaleAdverse` flag weighted whale bursts on both sides of a fill (LOG.md 2026-11-07), so bursts after the fill counted. With only prints strictly before the fill, how often is a fill "adverse", and does "adverse" coincide with a higher measured cost?
- **Setup:** the 1,713 fills of the three rebuilt Binance demos (`ml-service/demo_v2/out/`, real January 2024 prints; trader behaviour synthetic). Burst and pressure definitions unchanged (`whale/whale_score.py`; gaps ≤ 1 s, thresholds BTC/ETH 250k, SOL 100k, BNB 50k USD, decay 10 s). Old rule: prints in [fill − 30 s, fill + 30 s]. Pre-fill rule: prints in [fill − 30 s, fill). Control: the pre-fill rule with the opposite side. Outcomes: the fill's effective half-spread (`measure_fill`) and the mid drift over the 30 s before the fill, signed against the user. 95% bootstrap intervals (2,000 draws, fixed seeds).
- **Command:** `cd ml-service && .venv/bin/python scripts/whale_prefill_study.py` (read-only; never runs `whale/enrich.py`).
- **Results:**
  - Adverse rate, old rule: 15.3% (13.5-17.0%), 511 fills with any event; pre-fill rule: 6.8% (5.7-8.1%), 257 fills with any event. More than half of the old "adverse" flags depended on bursts after the fill.
  - Opposite-side control: 8.2% (6.9-9.5%). The true-side pre-fill rate is not higher, so whale flow did not run against these (synthetic, randomly timed) traders more than chance.
  - Effective half-spread, adverse vs not: medians 0.000 vs 0.000 bps, difference CI (−0.0023, 0.0012). Most demo fills pay at most half a tick (about 0.002 bps on BTC), so the medians sit at the resolution floor: this shows no detectable difference at this resolution, not the absence of an association. Takers only: −0.018 bps (−0.020, −0.0001), i.e. not higher.
  - Cross-check by the M2 reviewer (not printed by the script): of the 262 fills the old rule flags adverse, 154 (59%) are not adverse under the pre-fill rule.
  - Pre-fill drift over 30 s: +2.75 vs −0.51 bps, difference 3.26 bps (2.04-5.02). This is close to the definition: a burst pushing against the user before the fill coincides with the price having moved against the user before the fill. It is the burst's own movement, recorded as association only.
  - By demo (old → pre-fill): aggressive 13.9% → 8.2%, moderate 13.3% → 4.0%, disciplined 21.0% → 8.8%.
- **Limitations:** synthetic decision times (random with respect to whale flow, so a null result is expected); one month (January 2024); four symbols; the burst threshold was calibrated on the old demos; association only, never causation.
- **Status:** done. Consequence: the stored `whaleAdverse` flags of the old demos overstate adversity, and they are shown today (the analytics whale panel, `frontend/app/analytics/WhaleCorrelation.tsx`, and `risk.whale_adverse_count` in the Council packet). The seeded rebuilt demos carry no whale flags, so after the re-seed nothing whale-related shows for them until a pre-fill whale enrichment exists (roadmap item added for M4: a versioned whale score with the pre-fill rule, computed offline from public prints).
