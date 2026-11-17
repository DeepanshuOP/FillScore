# FillScore: final report (M0 to M7 and M9; M8 is a stop)

Date: 2026-11-18. Written for a reader who has not seen the work. Everything below is in the repository; the file paths say where.

## What FillScore is now

An open-source execution auditor for crypto traders. A user connects a read-only exchange key; FillScore reads their own past trades and measures, from real public market data, what each order cost: the spread paid, how far the price moved with it, what unfilled orders cost, and fees against the account's real rates. It audits the past. It never predicts, signals or advises, and a language model never produces a number.

It is deployed (Vercel, Render Frankfurt, MongoDB Atlas) with CI that gates the deploy. The product has two labelled scores (v1 rule-based and frozen; v2 measured, version 2.3.0), a cost-against-expectation line, an explain panel (exceptions, order replay, rankings, venue comparison), a Quick and a Deep audit, "Ask your execution", a broker-file check, signed evidence packs with a browser verify page, a read-only MCP server with personal API keys and a scorecard MCP App, scheduled re-sync with a stale-data line, and an open-source metrics package.

## How each pillar is met, with evidence

**Measured.**
- Measurement layer `ml-service/measure/`: aggressor-side quotes from real aggregate trades, effective and realized spread, price impact, order-level implementation shortfall with opportunity cost, the account's real fee rates; lineage (data files with SHA-256) on every number. Method page generated from the code (`docs/methodology/`, `/methodology`). Reports: `docs/milestones/M1.md`, `M2.md`.
- The three demos were rebuilt from real January 2024 prints; the v2.3.0 grades are 94.35 A, 93.41 A and 93.68 A. The score does not separate the three synthetic profiles (ADR-0014), and the first timing score measured volatility, not cost (ADR-0013): both are stated openly.
- Cost against expectation: a square-root impact model fitted on January 2024 with conformal intervals; held-out coverage 0.894 to 0.948 in all 16 symbol-and-size cells against a target of 88 to 92% (`docs/research/LOG.md` §Q). Real accounts read the hour before an order from Binance's public 1-minute klines (§U); the kline context equals the aggregate-trade context on the hour checked (a spot check, not a proof).

**Explained.**
- The Grounding Contract: placeholders and a deterministic renderer, blocking grounding, a versioned claim check, a counterfactual verifier; Ask answers pass code guards that a 113-case offline red-team and two independent reviews hardened (`docs/milestones/M5.md`).
- The evaluation measure `evidence_cited` failed on all 18 recorded runs because the evaluation contract was not the generation contract (`LOG.md` §M); the contract is fixed. The first number on the new recordings is waiting for the two ablation days (item 10).

**Verifiable.**
- Versioned scores with integrity hashes and a verify route; signed evidence packs (Ed25519; public key fingerprint `ba11aa53c4961be4`) checkable in the browser with nothing uploaded (`/verify`, `frontend/app/lib/evidenceVerify.ts`, an e2e test records every request) or offline with `scripts/verify_evidence_pack.mjs`.
- The metrics package `packages/fillscore-metrics` is generated from the service code; a test fails if it drifts.
- Cryptographic proof of where the trades came from was investigated and is not ready (`docs/research/ZKTLS_FEASIBILITY.md`): the one fully open option states it is not for production, and a transcript proof can never show completeness. The packs say what they do not prove.

## Invariants, checked

Audit the past only (copy audited in M9; the analytics heatmap wording and the OKX "Low fees" card were fixed). LLMs never originate a number (code-enforced). Read-only exchange keys, validated fail-closed, AES-256-GCM, never returned or logged (reviewed end to end). Provenance immutable. Published v1 grades unchanged (`gradeInvariance.test.ts` green). No fabricated data: unmeasured values read "insufficient data". Correlation, never causation. Free tier only: the one new runtime dependency is `@noble/ed25519` (MIT, pinned); CCXT is a dev dependency; billing code is off and needs a Stripe account that does not exist.

## Quality evidence (end of M9)

Backend 119 files, 998 tests; frontend 52 files, 387 tests, lint 0 errors (50 warnings left for M8), build clean; ml-service 1655 passed (3 tests wait for the owner's recordings to leave the folder); mcp-server 26; e2e 29; guard hook 214; roadmap IDs OK; gitleaks over 286 commits: no leaks. Independent reviews: M3, M4, M5, priorities 3 and 4, and the M9 security review (no high finding; medium findings fixed with tests). Reports: `docs/milestones/M0.md` to `M9.md`.

## What is honestly still missing

- **No real user has been scored.** Every measured number so far is on synthetic traders over real prints, or on test fixtures. The one-command harness `ml-service/scripts/validate_real_account.py` waits for real trades.
- **Not met by real data:** the Kraken file reading (built from documentation), the CCXT comparison, the MCP App in a real client, the k6 script (k6 not installed), Stripe (no account).
- **Not built:** perpetual funding costs (a key with a futures permission is refused by the read-only rule: decision item 16), the EVM DEX wallet audit (item 19), cryptographic proof of origin (not ready), per-plan quotas.
- **The ablation re-record** (single call against nine calls on rebuilt demos) is in the owner's hands; the old comparison was small and on synthetic users, and the README says not to read a result into it.
- **Known weaknesses stated in `SECURITY.md`:** in-memory limiters (per instance), AES-GCM without associated data, registration email enumeration, no sync cooldown, Node 20 end of life (item 21), unpinned installs in the ml-service image, no script-source CSP.
- **M8 (design) has not started**; the screens are functional and minimal on purpose.

## Exact steps to launch (yours; I did not push, create credentials or publish)

1. Decide and do the quick checks: `docs/PROGRESS.md` items 20 (secret lengths) and 21 (Node runtime). Report both ablation days when done (item 10) so that I can flip `golden/v3` and report `evidence_cited`.
2. `git push origin main` (CI gates the deploy). Then `scripts/smoke_prod.sh`.
3. Atlas runs: none are needed for launch (the demos were seeded on 2026-11-14). Never run the seed, purge or backfill scripts without reading `CLAUDE.md`.
4. First real-trade validation (the strongest launch asset): make a few small Binance trades, create a read-only key (only "Enable Reading"), connect it, then `python ml-service/scripts/validate_real_account.py --account <id>` (see its header), and read the result before showing anyone.
5. Keys and services already set: `EVIDENCE_SIGNING_KEY`, `ML_SERVICE_TOKEN_SECRET`, `ML_SERVICE_URL`. Optional switches: `RESYNC_ENABLED` (on), `BILLING_ENABLED` (off; do not enable before item 22(d)).
6. Publish: the blog drafts and the channel drafts in `docs/launch/` after reading them and the "Before posting" list; record the demo with `docs/launch/DEMO_SCRIPT.md`. Optionally publish `fillscore-metrics` to PyPI yourself.
7. Then M8 with me: a design-system proposal and a screen inventory, together.
