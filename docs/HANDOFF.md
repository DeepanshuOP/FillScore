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
- In progress: demo backfill `--apply`; deep audit (`BRIEF_audit_opus.md`) before Phase 4b-1.
- Known issues: the bar-based spread estimators overstate liquid-pair spreads (BNBUSDT 1.05–1.58 bps half-spread vs ~0.3 bps tick), so the 1.0 bp cap binds.

## Next
1. Audit report → revise `BRIEF_phase4b1.md` from its findings.
2. Phase 4b-1 (fee snapshots, Parquet/DuckDB lake, order reconstruction, provenance).
3. Phase 4b-2 (cost-vs-expected model with conformal intervals; Quick/Deep audit).
4. zkTLS spike. Billing last. **Design/UI pass (Track H): remind Deepanshu when it comes up.**
