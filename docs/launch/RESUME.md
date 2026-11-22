# Resume bullets and the 60-second summary

Draft for Deepanshu to edit. Written 2026-11-22. Each bullet holds **one number**, and the source of that number is in brackets: a file in this
repository, or a command that was run on 2026-11-22. Change the wording to your own; keep the number tied to its source. Every bullet states
what the project does today. FillScore is a student project; no real user has been scored yet (`docs/STATUS.md`), so none of these bullets
claims users or revenue.

## AI engineer

- Built a nine-call language-model audit (four specialists, a prosecution and defence debate, a synthesis) in which a model writes placeholders and
  code inserts every number; checked 36 recorded runs against six invariants with 0 gated violations
  [`python ml-service/evals/run_offline.py`; table in `README.md`, "Evaluation"].
- Wrote a versioned claim check that removes causal and advice wording from model text, with five rule versions (1.0.0 to 1.4.0) and 16 hand-written
  cases for the newest [`ml-service/agents/claims.py`; `ml-service/tests/test_claim_rules_1_4_0.py`, 16 passed].
- Reported the weak results as results: the evidence-citation check fails on 36 of 36 recorded runs and the cause is in the measure, not the models;
  the single call against the nine-call Council is stated as small and descriptive, not a win
  [`README.md` "Evaluation"; `ml-service/evals/ablation_results_v3.md`; `docs/research/LOG.md` §Z].

## Software developer

- Shipped four services (Next.js on Vercel, Express and FastAPI on Render, a read-only MCP server) over MongoDB Atlas, with an API route table
  of 75 rows that a test keeps equal to the code [`ARCHITECTURE.md`; `backend/src/__tests__/architectureDocs.test.ts`].
- Kept 3,655 automated tests passing across the tiers in one session (backend 1,053, ml-service 1,810, frontend 727, end-to-end 39, MCP server 26;
  the five ml-service tests that were red are named in `docs/PROGRESS.md`) [pytest, vitest, Playwright and `node --test` runs of 2026-11-22].
- Designed read-only access end to end: exchange keys that can trade or withdraw are refused before storage, and personal API keys for AI clients
  are read-only, hashed, limited to 60 requests a minute and expire after 90 days unless set otherwise
  [`mcp-server/README.md`, "Limits, stated plainly"].

## Data and analytics

- Measured each fill and order against real public Binance prints: the demo account `demo-moderate` has 607 fills in 245 orders scored against
  January 2024 data, in 119 checksummed market-data files [`docs/STATUS.md`; `ml-service/demo_v2/out/manifest.json`, `tapes`].
- Built a cost-against-expectation model (a square-root impact model fitted on public prints, with 90% intervals) whose intervals covered 0.894 to 0.948 of held-out cases
  in all 16 symbol-by-size cells, not tuned to hit the target [`docs/milestones/M3.md`].
- Made "too few to tell" a first-class result: a group with fewer than 20 orders is not ranked, and an unmeasured value reads "insufficient data",
  never zero [`mcp-server/README.md`, rankings; `DESIGN.md` section 11].

## Web developer

- Built a Next.js 16 and React 19 interface in a paper-and-ink design (one idea per screen, margin notes, a printed receipt) with 727 unit tests
  and 39 browser tests [`npx vitest run` in `frontend/`; `npm run test:e2e`; `DESIGN.md` section 11].
- Checked 48 screen states at two widths for overflow and accessibility: 0 overflow, and the one remaining automated accessibility report is
  documented [`frontend/e2e-shots/qa3.ts`, pass `c1`; `docs/milestones/M8.md`].
- Made the numbers shown in the browser come only from the server: the Council page prints "BTCUSDT only: 344 of the account's 607 fills" from two
  served counts, and a browser test reads it from the real stream [`frontend/e2e/council-demo.spec.ts`; `docs/research/LOG.md` §AH].

## Product manager

- Defined the product around eight invariants (audit the past, no model-written numbers, read-only keys, immutable provenance, frozen published
  grades, no fabricated data, correlation not causation, free tier first) and enforced them in tests
  [`docs/agent/MASTER_BRIEF.md`, "Invariants"].
- Found and fixed a scope error before launch: the Council audited one symbol while every other screen covered the account, so its notes quoted
  344 of 607 fills; it now says so on the page and the one-symbol packet no longer carries account-level concentration
  [`docs/research/LOG.md` §AH].
- Wrote the launch plan with a stated baseline of 0 real users scored and three launch measures (users scored, audits run, verified packs), and a
  status table that shows 2 of 10 milestones done and 8 partial [`docs/product/PRD.md`; `docs/STATUS.md`].

## The 60-second spoken summary

"FillScore is an independent auditor for crypto trades. It looks at orders that already happened and asks how well they were executed. You connect an
exchange key that can only read. FillScore compares each fill with the real public trades from that second, and shows what the order cost: the spread,
how far the price moved, the fees, and what orders that never filled cost.

Three rules shaped it. It audits the past and never predicts or advises. A language model can explain a finding, but every number comes from code that is
tested. And you can check the result without trusting me: scores have a version and a hash, and the signed evidence packs can be checked in the browser or
with one Node script.

It runs on free hosting with an Express service, a Python service and a read-only MCP server. I have three demo accounts with synthetic traders and real
prices. No real user has been scored yet, and I say that on the page. The part I am proudest of is that I wrote down the weak results too."
