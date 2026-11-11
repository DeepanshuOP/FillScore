# FillScore — Handoff

Short current-state file. A new session reads `docs/agent/MASTER_BRIEF.md`, then `docs/PROGRESS.md`, then this file. **Overwrite "Now" and "Next" at the end of every milestone.** Older history lives in `docs/research/LOG.md`, the ADRs and `docs/milestones/`. Keep this file under about 60 lines.

## What FillScore is
An open-source, independent execution auditor for crypto traders. It **grades past execution** against real public market data and never predicts, signals or advises. LLMs may label, argue and explain, but never originate a number.

## Where things are
- **Live:** frontend `fill-score-kappa.vercel.app` (Vercel); API `fillscore-api` and ML `fillscore-ml` (Render, Frankfurt, auto-deploy after CI passes); MongoDB Atlas database `fillscore`.
- **Code map:** `ARCHITECTURE.md`. **Agent rules:** `CLAUDE.md`. **Roadmap:** `docs/ROADMAP.md` (the only one).
- **Research record:** `docs/research/` (LOG, EXPERIMENTS, decisions, RELATED_WORK, AUDIT_2026-11, MARKET_2026-11).
- **Design and plan for the current work:** `docs/superpowers/specs/2026-11-07-measurement-v2-design.md` and `docs/superpowers/plans/`.

## How work happens
- The work follows the milestones in `docs/agent/MASTER_BRIEF.md`. Progress and the next action are in `docs/PROGRESS.md`.
- The agent commits locally at the end of each milestone, with all suites green. Deepanshu pushes.
- The agent asks Deepanshu before any Atlas write, `--apply`, push, history rewrite, paid service, new credential, or change to the guard hook or settings. Requests are listed in `docs/PROGRESS.md` under "Waiting for Deepanshu".

## Now
- **Two scores.** v1 (rule-based, frozen, locked demo grades) and v2 (measured, M1). v2 measures each Binance fill against real public prints (`ml-service/measure/`), measures order shortfall and the account's real fee rates, and scores under the committed version `ml-service/scoring_v2/versions/v2.0.0.json`, with an integrity hash and a verify route. Report: `docs/milestones/M1.md`.
- **Measurement in production** needs `ML_SERVICE_URL` on the backend (listed in `docs/PROGRESS.md`). Until then, sync works as before and v2 is skipped.
- **Demo data:** the three Binance demos have real prices for MARKET fills only; LIMIT slippage is forced to 0. demo-bybit, demo-okx and demo-multi are hidden. Demos show "v2 not available yet" until M2 rebuilds them.
- **No real user trade has been scored yet.** `ml-service/scripts/validate_real_account.py --account <id>` is the one-command check for the first real trades.
- **Milestone state:** see `docs/PROGRESS.md`.

## Next
See "Next concrete action" in `docs/PROGRESS.md`.

## Known issues
- The bar-based spread estimators (Corwin–Schultz, Abdi–Ranaldo) read volatility, not spread, on liquid pairs. Measurement v2 replaces them with aggressor-side prints (ADR-0008).
- The eval measure `evidence_cited` fails on every recorded run. It is measured, not gated. Finding the cause is part of milestone M3.
- Git history contains old, rotated credentials, and the repository is public, so they are visible today. Whether to purge the history is a pending decision for Deepanshu (roadmap item R6-G13; listed in `docs/PROGRESS.md`).
