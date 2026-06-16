# Claim-Evidence Map

## 1. Compute-then-judge grounding contract with a measured faithfulness metric (E1). No reference repo can compute this.

- **Implementation:** `agents/grounding.py:check_grounding`
- **Metric/Table:** Table 1 (Faithfulness)
- **Status:** `measured_pilot`
- **Evidence Note:** AC-11 validated run numbers: `leakage_free=true`, `pre_cutoff_trade_count=36`, `E1_faithfulness=1.0`. Full statistical tables are pending the eval run.

## 2. Adversarial execution-attribution debate (prosecution/defense/judge) — audits skill vs luck vs market.

- **Implementation:** `agents/debate.py:run_debate`
- **Metric/Table:** Table 2 (Consistency)
- **Status:** `pending_full_eval`
- **Evidence Note:** Full statistical tables are pending the eval run.

## 3. Deterministic counterfactual verification of LLM recommendations with forced self-correction.

- **Implementation:** `agents/verification.py:verify_recommendations`
- **Metric/Table:** Table 3 (Utility)
- **Status:** `pending_full_eval`
- **Evidence Note:** Full statistical tables are pending the eval run.

## 4. Leakage-free walk-forward evaluation of an auditing (not trading) agent system on real microstructure.

- **Implementation:** `eval/harness.py:assert_no_future_leakage`
- **Metric/Table:** E1/E2/E3 leakage bounds
- **Status:** `measured_pilot`
- **Evidence Note:** AC-11 validated run numbers: `leakage_free=true`, `pre_cutoff_trade_count=36`, `E1_faithfulness=1.0`. Full statistical tables are pending the eval run.

## 5. Cost-quality frontier across open models, all on free tiers ($0/run).

- **Implementation:** ``
- **Metric/Table:** Table 5 (Cost-Quality)
- **Status:** `not_measured`
- **Evidence Note:** No multi-model comparison has been run. AC-12 is required to produce this evidence.

