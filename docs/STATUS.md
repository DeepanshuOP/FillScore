# FillScore: project status (2026-11-22)

Written for Deepanshu's review. Read from the repository, not from memory. "Done" means every part listed in the
master brief exists and has a test or a report. "Partial" means at least one listed part is missing. Evidence is the
milestone report in `docs/milestones/` and the commits in `docs/PROGRESS.md` ("Milestone status").

## Table: master-brief milestones M0 to M9

| Milestone (Roadmap v5 items) | State | Evidence | What is left |
|---|---|---|---|
| **M0** Orientation, research, hygiene | **Done** | `docs/milestones/M0.md`; commit `ff681be`; `docs/research/MARKET_2026-11.md` (46 sources); `docs/PROGRESS.md` | Nothing. |
| **M1** Measurement v2 and Scoring v2 (A1-A4, A7, A8, A11, B2, B6; D1 verify route; `/methodology`) | **Partial** | `M1.md`; commits `0aa0603`, `5d43067`, `6ab568e`, `46e08f3`, `20d0e17`; hand-computed cases in `ml-service` and `backend` tests; `GET /api/audit/verify` | The check on a real account is open: no real user has been scored (R6-B0.4). Bybit and OKX orders are not measured (`unmeasuredReason`). The `/methodology` page exists and is generated; its drift test passes. |
| **M2** Real demos (A14-A17) | **Partial** | `M2.md`; commits `a3d85da` to `2747be7`; `ml-service/demo_v2/out/manifest.json` (119 checksummed files); Atlas seeded by Deepanshu 2026-11-14 | `demo-bybit` is not rebuilt (it returns with Bybit measurement). The ablation runs 4-6 are recorded, but `golden/v3` is not flipped because three runs state a cause (PROGRESS item 23). OKX and multi demos were removed on purpose. |
| **M3** Cost against expectation, AI layer (A5, C1, C7, E7, `evidence_cited` fix) | **Done** | `M3.md`; commits `ec9abe2` to `195a8a3`; interval coverage 0.894 to 0.948 in 16 cells; PROGRESS item 25 fixed the `evidence_cited` rule | The single-call versus Council comparison is still n=3 on synthetic traders (a research limit, not a missing part). |
| **M4** Explain and act (A6, A14, C3, E1, E2, E6, D1 badge, venue comparison) | **Partial** | `M4.md`; commit `195a8a3`; tests for the queue boundaries, replay USD, ranking | The fee-schedule gap per fill (A12) is not built. The stop-order audit (A13) was dropped: the stored order history has no stop price. |
| **M5** Trust and reach (D2, E3, F1, C2, C6, G1, G2) | **Partial** | `M5.md`; commits `af3f2e7` to `16c53e5`; `scripts/verify_evidence_pack.mjs`; `mcp-server/` (16 tests); 178 offline red-team cases | No public timestamp in a transparency log (the D2 sharpening). No Promptfoo: guardrails are tested offline in pytest instead (recorded in M5). Rate limits and the cache are in memory, not Redis (G1). The verify body-size increase was declined. |
| **M6** Breadth (B1, B3, B5, G6) | **Partial** | `M6.md`; commits `23f57d1`, `4f59d35`, `c55e556`, `fa8059e`; `/check` page; stale-data line; scheduled re-sync | Perpetual funding costs are deferred (a futures key is refused by I3). CCXT is a dev dependency with an offline shadow comparison; the live run needs a key (item 17). Lint debt is partly left. Bybit and OKX full history is not live. |
| **M7** Differentiators (D3, D4, F2, F4, B4) | **Partial** | `M7.md`; commits `7030aab`, `bc5935c`, `8915486`; `docs/research/ZKTLS_FEASIBILITY.md`; `packages/fillscore-metrics/`; `mcp-server/app.mjs` | The EVM DEX audit is not built (item 19, deferred). The DP baselines are a tested mechanism, not wired in (no users). The MCP App was tested against the specification with a fake host, not in a real client. zkTLS verdict: not buildable now. The package is not published. |
| **M8** Design and UI (H1-H5) | **Partial** | `DESIGN.md`; `docs/milestones/M8.md`; design v3 and v3.1 commits (latest `1d26e56`); `docs/design/v31/` | Design v3.1 is live on the landing page, overview and receipt. Every other screen is converted by this order (Part B). The real-device check (Safari, Firefox, phone) is not done. |
| **M9** Launch readiness (G5, G3) | **Partial** | `M9.md`, `docs/FINAL_REPORT.md`; commits `5db6784`, `9a1903d`, `cf0176a`, `eeda97e`; gitleaks scan of full history | The k6 script exists and was not run. Items 20 (secret length), 21 (Node 20 runtime), 22 (pre-launch steps) are open. Stripe is prepared and off (no account). Blog and video drafts exist; none is published. |

## Facts read from the code

**LLM provider and model.** `ml-service/agents/llm_router.py` routes by role from `ml-service/config/llm_routes.yaml`.
All routes are free tiers, budget $0. First choice per role, then fallbacks in the order listed:

| Role | First choice | Fallbacks |
|---|---|---|
| specialist (also the Ask planner) | Groq `qwen/qwen3.8-27b` | Groq `openai/gpt-oss-20b`, Groq `openai/gpt-oss-120b`, Gemini `gemini-3.5-flash-lite`, Gemini `gemini-3.8-flash` |
| debate | Groq `openai/gpt-oss-20b` | Groq `openai/gpt-oss-120b`, Gemini `gemini-3.5-flash-lite`, Groq `qwen/qwen3.8-27b` |
| synthesis | Groq `qwen/qwen3.8-27b` | Groq `openai/gpt-oss-120b`, Gemini `gemini-3.8-flash`, Gemini `gemini-3.5-flash-lite`, Groq `openai/gpt-oss-20b` |

OpenRouter is configured as a provider and has no model routed. Which model answered a given run is recorded on that
run; this table is the configuration, not a measurement.

**Locked v1 demo grades** (`backend/src/scoring/__tests__/gradeInvariance.test.ts`, `frontend/app/utils/demoProfiles.ts`):
`demo-disciplined` 95.88542572161496 (A), `demo-moderate` 84.80888516669383 (B), `demo-aggressive` 60.67469266790485 (C).

**Current v2 demo grades** (`ml-service/demo_v2/out/grades_v2.json`, scoring v2.3.0, measured version 1.0.0):

| Account | Composite | Letter | Orders | Fills |
|---|---|---|---|---|
| `demo-aggressive` | 94.34969957374337 | A | 311 | 721 |
| `demo-disciplined` | 93.67696144989966 | A | 144 | 385 |
| `demo-moderate` | 93.40556873724222 | A | 245 | 607 |

All three read A under v2.3.0. This is the served value; it does not rank the traders the way v1 does. It is open for
Deepanshu (PROGRESS, design v3.1 "Open for Deepanshu").

## Dependabot (step 0b)

GitHub's banner said "1 vulnerability (1 high)". Read on 2026-11-22:

- `gh api repos/DeepanshuOP/FillScore/dependabot/alerts?state=open` returns **0 open alerts**. The last alerts in the
  list are all `fixed` (for example #270 minimatch, fixed 2026-11-13).
- `npm audit`: frontend, backend and mcp-server each report 0 vulnerabilities. `pip-audit` in `ml-service`: no known
  vulnerabilities.
- M9 had recorded a high `picomatch` advisory reached through `@sentry/nextjs`; it no longer appears in the alerts or in
  `npm audit`.

Result: nothing to patch. The banner is not reproduced by the API or by the audits; it is probably an older cached
count, or it counts something the Dependabot alerts API does not (code scanning or secret scanning would show under
other API routes, which I did not query). No dependency changed.

## Not verified here

- Production state (what is deployed on Vercel and Render). Local `main` is ahead of `origin/main` by 7 commits at the
  start of this order; I did not read the deployed commit.
- Test counts of this date: see the final check summaries in `docs/milestones/M8.md`, "Design v3.1 complete".
