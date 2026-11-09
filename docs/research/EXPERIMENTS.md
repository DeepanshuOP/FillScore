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
