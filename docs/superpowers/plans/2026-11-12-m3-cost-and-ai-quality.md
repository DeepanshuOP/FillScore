# M3 plan: cost against expectation, and the AI layer's quality

- **Date:** 2026-11-12
- **Brief:** `docs/agent/MASTER_BRIEF.md` M3. **Roadmap:** §3a (M3 = 4b-2 + C7 + the `evidence_cited` fix), E7.
- **Outcome for a user:** each order shows what it cost against what a similar order usually costs in that market, with an honest interval or "insufficient data". The default audit is one LLM call (Quick); the Council (Deep) is opt-in and budgeted. Every explanation still cites only verified numbers.

## 0. Facts checked before planning
- **No ML library is installed** in `ml-service/.venv`: no scikit-learn, SciPy, LightGBM, MAPIE or crepes (checked 2026-11-12). numpy and pandas are present.
- **The budget layer partly exists.** `agents/council_service.py` already has a content-hash cache (zero LLM calls on a repeat), a daily AI budget (`config/budget.py`) and per-account quotas.
- **`evidence_cited` fails by design** (LOG §M): the golden sets require keys the synthesis prompt never asks for.
- **Data for the cost model:** 124 checksum-verified January 2024 daily files in `ml-service/.cache/market/zips` (local); 360 day summaries of Aug-Nov 2026 (spreads only, no event sizes).

## 1. `evidence_cited`: fix the cause (first, offline-testable)
- **Cause:** the evaluation and generation contracts differ (LOG §M).
- **Fix:** one rule, in code, used by both sides.
  - `agents/required_evidence.py` `required_keys(packets) -> list[str]` is deterministic. It returns `fee.total_fee_paid_usd` (always, if present), plus the headline key of the specialist area with the highest severity, in the priority order Fee > Risk > Liquidity > Alpha. Each area's headline key is listed in one table.
  - The synthesis prompt gets "The narrative must state these values, as placeholders: {{...}}" built from `required_keys`. A prompt version bump is needed (`PROMPT_VERSION` 1.7.0, single-call 1.2.0).
  - Golden set v3's `required_evidence.synthesis` comes from the same function, never from a hand-written list. `dump_golden_packets` fills it; the manifest records the rule's code hash.
  - The grounding pass already renders placeholders. If a required key is still missing after the grounded call, it is reported (measured), never inserted by code into LLM text.
- **Tests (hand values):**
  - `required_keys` on the three golden v2 packets, with the expected lists written out.
  - Prompt text contains every required placeholder.
  - `evidence_cited` on a fixture result that cites them passes, and on one that omits one fails, naming the key.
- **Verification:**
  - Offline: `run_offline.py` reports the old 18 recordings unchanged (they stay against their own sets).
  - Live: at most 5 Council runs this session, through the recording path, verified with the `verify-council-run` checks. The full re-record is Deepanshu's `rerecord_ablation_v2.sh`.

## 2. Expected cost per order (Measured pillar)
- **Model 1, square-root impact (Almgren et al. 2005; Tóth et al. 2011; cite before use):** expected execution cost in bps = s/2 + Y·σ·sqrt(Q/V).
  - s/2: the symbol's median effective half-spread of taker events (v2.1.0 anchors, by notional bucket).
  - σ: the 1-minute volatility over the hour before the order.
  - Q: the order quantity.
  - V: the traded volume over the hour before.
  - Y: fitted by least squares on public taker events of January 2024 (numpy only). The events are the public stand-in for orders. A train/test split by day avoids leakage.
- **Model 2, residual (only if it earns its place):** a gradient-boosted residual is added only if it lowers the out-of-sample error of Model 1 by at least 10% on held-out days. That needs a new pinned dependency: scikit-learn `HistGradientBoostingRegressor`, BSD-3. Its licence and size are recorded in an ADR before it is added. Otherwise Model 1 stands alone.
- **Interval:** split conformal, implemented in numpy (about 20 lines, with hand-checked quantile tests). The 90% interval comes from the calibration days' absolute residuals, per notional bucket. When the bucket's calibration sample is below 200, or the order's features are outside the calibrated range, the result is "insufficient data".
- **Shown as:** "this order cost X bps; similar orders in this market usually cost Y bps (90% range A-B)". Past tense, no advice. It is a new field family `expectedCost` in the order measurement, with a registry row, `MEASURE_VERSION` 1.1.0 and an ADR.
- **Tests:** hand-computed square-root cases; conformal quantile on a 10-value fixture; "insufficient data" at the boundary; a coverage check on held-out days, reported in LOG (target 88-92% for a 90% interval).

## 3. Quick audit and Deep audit (Explained pillar)
- **Quick (default):** the single-call arm, already built and verified (EXP-001).
- **Deep (opt-in):** the 9-call Council, behind the existing quota and budget, and labelled with its cost (calls used).
- **Changes:**
  - a `mode` parameter on the audit endpoint (default `quick`);
  - the frontend toggle;
  - tests for the default, the opt-in and the quota refusal.

## 4. Budget engine (Explained pillar)
- **Already present:** the content-hash cache, the daily budget, per-account quotas and model fallback (router).
- **Added:**
  - a per-mode budget: Deep costs 9 units, Quick 1;
  - graceful degradation: when Deep is refused for budget, offer Quick with a plain message, and never fail silently;
  - a budget status endpoint for the UI.
- **Tests:** budget arithmetic, the degradation path, and the cache hit on an identical packet.

## 5. Order of work
§1 (offline parts) → §2 (data and model, offline) → §3 → §4 → live check of §1 (at most 5 runs) → reviewer → M3 report.

## 6. Edge cases
- An order in a symbol outside the calibration set: "insufficient data".
- An order larger than any calibration event: outside the range, so "insufficient data".
- A Council run that degrades (`429`, `RouterExhausted`): reported as degraded, and never shown as a full Deep audit.
- A golden set whose `required_evidence` was hand-written (v1, v2): kept as recorded, never rewritten.
