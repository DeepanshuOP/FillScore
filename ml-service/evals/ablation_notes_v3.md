## Notes for golden set v3 (prompt 1.7.0, single-call prompt 1.2.0, metrics 1.3.0)

Hand-written, 2026-11-19. The table above is generated; the breakdown below is checked against `python evals/ablation_breakdown.py` by a test.

**What these runs are.** Eighteen recordings made by Deepanshu on 2026-11-18 and 2026-11-19: three demo users, runs 4 to 6, both arms (9 Council runs, 9 single-call runs). They are kept exactly as recorded. Three runs state a cause and were not re-rolled: `council-demo-disciplined-5` ("inherent to the limit-order strategy rather than a routing error"), `single-demo-disciplined-5` and `single-demo-disciplined-6` ("resulting in a fee drag"). Re-rolling runs until they pass would bias the ablation, so none was.

**Claim rules.** The gated check judges each recording by the claim rules it was made under (1.1.0 here), and all 18 pass it. The measured column applies rules 1.2.0 (causal phrasings and number-free judgements) to every recording, both arms alike. The three runs above fail it, and so do runs that say "efficient routing" or "low fee drag" with no number in the sentence.

**Evidence cited: 0 of 18, and the cause is in the measure, not in the models.** `evidence_cited` requires the synthesis to state one headline value per area. For all three demo users the alpha area's headline key is `alpha.median_opportunity_bps_unfilled`. `agents/render.py` `format_value` formats a `_bps` suffix only, and this key ends in `_unfilled`, so the placeholder `{{alpha.median_opportunity_bps_unfilled}}` raises "unformatted": no run, in either arm, could state that value. The rule is unsatisfiable for these cases today. Until the formatter is fixed (a decision for Deepanshu, because it changes the conditions for any later re-record), read the `evidence_cited` column as "cannot pass", not as "the models did not cite". The other required keys can be read from the per-run detail of `python evals/run_offline.py`: for example `single-demo-moderate-4` also misses `liquidity.median_spread_paid_bps`.

**Breakdown by run number** (the same rule for both arms; "20b specialist runs" are the Council runs whose specialists were partly served by gpt-oss-20b, `demo-aggressive-6` and `demo-disciplined-4`; the single-call arm has no specialists). Runs 1-3 are the older recordings of golden set v1, judged against that set's own packets.

| arm | runs | variant | runs counted | evidence_cited (runs that cite every required value) | flagged by claim rules 1.2.0 |
|---|---|---|---|---|---|
| council | runs 1-3 | all | 9 | 0/9 (0.0%) | 8/9 (88.9%) |
| council | runs 1-3 | without 20b specialist runs | 9 | 0/9 (0.0%) | 8/9 (88.9%) |
| council | runs 4-6 | all | 9 | 0/9 (0.0%) | 6/9 (66.7%) |
| council | runs 4-6 | without 20b specialist runs | 7 | 0/7 (0.0%) | 4/7 (57.1%) |
| single | runs 1-3 | all | 9 | 0/9 (0.0%) | 2/9 (22.2%) |
| single | runs 1-3 | without 20b specialist runs | 9 | 0/9 (0.0%) | 2/9 (22.2%) |
| single | runs 4-6 | all | 9 | 0/9 (0.0%) | 2/9 (22.2%) |
| single | runs 4-6 | without 20b specialist runs | 9 | 0/9 (0.0%) | 2/9 (22.2%) |

**Limits.** n = 3 runs per user and arm, on synthetic demo users: the rates above show the size of the effect and carry no significance. The 1.2.0 rules are word and pattern rules; "unbacked" means no numeral and no placeholder in the same sentence, so a judgement with an unrelated number in its sentence passes. The two runs with a 20b specialist differ in model, not in prompt.
