# FillScore — Handoff (read this first in any new chat or agent session)

Short, current-state file. **Overwrite the "Now" and "Next" sections at the end of every phase**; everything older moves to `docs/research/LOG.md` or an ADR. Keep it under ~120 lines.

## What FillScore is
An open-source crypto Transaction Cost Analysis SaaS. It **grades past execution** against real market data and never predicts, signals or advises. LLMs may label, argue and explain, but never originate a number.

## Where things are
- Live: frontend `fill-score-kappa.vercel.app` (Vercel); API `fillscore-api` and ML `fillscore-ml` (Render, Frankfurt, auto-deploy after CI checks pass); MongoDB Atlas db `fillscore`.
- Code map: `ARCHITECTURE.md`. Agent rules: `CLAUDE.md`. Research record: `docs/research/` (LOG, EXPERIMENTS, decisions/, RELATED_WORK).
- Roadmap: `FillScore_Roadmap_v5.md` (claude.ai Project). Older: Unified v4, Supreme v2.
- Briefs and reports: `.work/BRIEF_*.md`, `.work/REPORT_*.md` (local, not committed).

## How work happens
- An architect chat writes a brief. Claude Code in WSL (`~/FillScore`) runs it (`claude --model sonnet --effort medium`, auto mode off, a `/goal` line that allows BLOCKED). Deepanshu reviews the report and commits/pushes himself.
- Agents never commit, push, `--apply`, write to Atlas, call live LLMs (unless the brief says so), or print secrets. Commits carry only Deepanshu's authorship.

## Now (update every phase)
- Last completed: Phase 4a (markouts at 1/5/30/60/300 s, Corwin–Schultz + Abdi–Ranaldo spreads, spread-aware counterfactual). Demo backfill dry-run: 897/897 priced, 0 errors.
- 4R-0 and 4R-0b: partial (see `.work/REPORT_phase4r0b.md`). Done in 4R-0b: guard hardening, migration/registry hardening, dashboard/copy/coach fixes, skipped-trade disclosure, hidden demos at the API (404 `demo_unavailable`). Not done: frontend picker/sitemap/comparison-card message and the Playwright check for hidden demos.
- 4R-0c (see `.work/REPORT_phase4r0c.md`): done: hidden demos in the UI + e2e (14 pass), sed-`e` guard, spreadBps repair path (real users only), all-skipped 422, taker-fee fallback, Council without regime and with markout-based reversion. **Blocked:** the regenerated golden packets changed the demo-moderate/aggressive liquidity hashes, so `packet_provenance` fails on stored recordings (pytest 2 failures, `run_offline` 14 violations, `ablation --check` stale) until they are re-recorded with live LLM runs (your call). Roadmap merge (Task 8) not started.
- 4R-0d (see `.work/REPORT_phase4r0d.md`): done: versioned golden sets (v1 recorded = ablation set, byte-identical; v2 unrecorded, regenerated with metrics 1.2.0), version-aware `run_offline`/`ablation --check`/dumper, roadmap IDs OK, plan wording fixed. **Blocked:** the demo Council re-record: 1 of 3 live runs used, `RouterExhausted` on synthesis (default fallback), nothing written; `demo_runs/*.json` still show "STABLE regime". So 4R-0 is complete except that item.
- In progress: migration dry-run against Atlas (Deepanshu's call, then `--apply`).
- Known issues: the bar-based spread estimators overstate liquid-pair spreads (BNBUSDT 1.05–1.58 bps half-spread vs ~0.3 bps tick), so the 1.0 bp cap binds.

## Next
0. Re-record the 3 demo Council runs when the free-tier router has headroom (`generate_demo_runs.py --yes --persist --user <u>`, no `--max-calls` cap tighter than ~20; then drop the xfail in `tests/test_demo_runs_regime_text.py`). Then 4R-1a. The ablation re-record on v2 waits until after 4R-2.
1. Audit report → revise `BRIEF_phase4b1.md` from its findings.
2. Phase 4b-1 (fee snapshots, Parquet/DuckDB lake, order reconstruction, provenance).
3. Phase 4b-2 (cost-vs-expected model with conformal intervals; Quick/Deep audit).
4. zkTLS spike. Billing last. **Design/UI pass (Track H): remind Deepanshu when it comes up.**
