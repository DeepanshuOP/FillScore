# FillScore — Master brief for completing the product

You are taking over FillScore and carrying it from where it stands today to a launch-ready product. This brief gives you the direction, the boundaries and the way of working. It doesn't give you a task list to follow mechanically: you are expected to research, judge, design, build, verify and improve. The work is long. It runs across many sessions, and usage limits may end a session at any point, so it is organised into milestones, with progress recorded in the repository (see "Resuming").

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it. The only limits on that are the invariants and approval rules below; they exist because real users and their money depend on them.

## What FillScore is

FillScore is an independent, verifiable **execution auditor** for crypto traders. A trader connects a **read-only** exchange API key. FillScore pulls their own trade history and measures how well each trade was executed against real public market data:
- the spread they paid;
- the price impact they caused;
- the cost of bad timing;
- fees against the rates their account actually qualifies for;
- the cost of orders that didn't fill.

AI agents then explain the findings in plain language, but every number in an explanation comes from deterministic code and is verified. **FillScore audits the past. It never predicts, signals or advises.**

**Why it matters:**
- Institutional desks have had transaction cost analysis (TCA) for decades: Bloomberg BTCA, plus Talos, CoinRoutes, Kaiko and Botminds in crypto and adjacent markets. These tools are closed, expensive, institution-only, or they grade the vendor's own routing.
- 2026 studies (TUM, Frankfurt School) measured retail crypto round-trip costs of roughly 0.5% to 7.5%, with posted fees often well under half of the real cost.
- MiCA Article 78 (enforceable since 1 Jul 2026) requires crypto service providers to evidence best execution.
- Nobody serves retail and prosumer crypto traders, or small brokers and desks, with an independent, explainable, verifiable audit. That is the opening.

**Three pillars;** every feature must strengthen at least one:
1. **Measured:** institutional TCA methodology on real public market data (Binance publishes every trade with its aggressor side, so spreads can be *measured*, not inferred).
2. **Explained:** AI narratives whose numbers are true by construction (placeholder grounding, a claim check, deterministic counterfactual verification).
3. **Verifiable:** versioned scores, integrity hashes, replays, signed evidence and, later, cryptographic proof of where the trades came from.

**Deepanshu** is the owner: a final-year BTech student at VIT Vellore. FillScore is his flagship portfolio project, aimed at software, data, AI/ML and quant roles. His goals, in order: (1) a project that earns interviews and holds up to deep technical questioning; (2) a research paper; (3) open-source recognition; (4) a sellable SaaS. Quality, honesty and depth beat feature count.

## Where it stands (read the files; don't trust this summary over them)

**Built and deployed:**
- **Hosting:** Vercel (Next.js 16), Render Frankfurt (Express/TS API, FastAPI/Python 3.11 ML service), MongoDB Atlas.
- **CI and smoke:** CI gates deploys (backend, frontend, ml, lint, e2e, eval). `scripts/smoke_prod.sh` checks the live commit.
- **Accounts and keys:** auth (JWT, Google/GitHub OAuth, email verification); per-account isolation with cross-user tests; read-only key enforcement (fail closed); AES-256-GCM key storage.
- **Sync and data rights:** lease-based background sync, GDPR export and delete.
- **Observability:** Sentry ×3 and Langfuse tracing.
- **AI layer:** a 9-call Agent Council (4 specialists, a prosecution/defence debate, synthesis) and a single-call arm, both behind placeholder grounding, a claim check and a counterfactual verifier, with golden-set evals and an ablation (results for prompt v1.5.0 in golden set v1).
- **Phase 4R-0 (just finished):** fixed a field collision, made displayed numbers honest, disclosed skipped trades, hid the three demos that had simulated prices, removed a placeholder "regime" from prompts, added a field registry, hardened the guard hook and consolidated the roadmap.

**The honest gaps:**
- **Scoring v1 is rule-based and partly inaccurate:** a 1-minute arrival proxy, a high–low spread heuristic, hand-picked "good hours".
- **Demo trades are only partly real:** LIMIT fills had slippage forced to 0.
- **No real user has ever been scored.** Deepanshu hasn't traded on Binance yet; see "Real data without real trades".
- **The ungated `evidence_cited` eval measure fails on every recorded run.**
- **The single-call vs Council ablation** is n=3 on synthetic users.
- **Bybit/OKX** are wired but untested with live keys.

## Read first, in this order

1. `CLAUDE.md`, `docs/HANDOFF.md`, `docs/PROGRESS.md` (if it exists).
2. `docs/ROADMAP.md`: the single roadmap: phases, tracks A–H and R, and every older item ID with its status.
3. `docs/research/AUDIT_2026-11.md`: the full correctness and provenance audit. Its findings drive the measurement work.
4. `docs/superpowers/specs/2026-11-07-measurement-v2-design.md`: the approved design for measurement v2 and Scoring v2.
5. `docs/superpowers/plans/2026-11-09-phase-4r1a.md`: a detailed, unexecuted plan for the measurement layer, with hand-computed test values. Use it; improve it where you find better.
6. `docs/research/` (LOG, EXPERIMENTS, decisions/ADRs, RELATED_WORK) and `ARCHITECTURE.md`.

## Invariants (never relaxed by any feature)

- **I1. Audit the past; never advise, signal or predict.** This is also FillScore's legal line. Every user-facing text surface passes the existing claim/advice tests.
- **I2. LLMs label, argue and explain; they never originate a number.** Every number traces to deterministic, tested code.
- **I3. Read-only exchange keys, validated fail-closed.** Never request or accept withdrawal or trading permissions.
- **I4. Published grades never change silently.** Scoring v1 stays frozen and reproducible for the locked demo grades (`gradeInvariance.test.ts` stays green). Any scoring change is a new versioned score.
- **I5. Provenance is explicit and immutable** (`synthetic-demo`, `real-user`, and a new `testnet` if you add it). Simulated or synthetic data is never presented as real.
- **I6. Free tier first; secrets only from env.** Never print, log or commit a secret. Check env vars by name or non-empty test only.
- **I7. External facts come from cited sources:** exchange API shapes, fee formulas, timestamp units, formulas from papers. Use the docs-research subagent, Context7 or official docs, and cite them.
- **I8. Correlation, never causation,** in any copy ("coincided with").

**No fabricated data, ever.** If a value can't be measured, say so and show "insufficient data". Never invent a plausible number, and never edit recorded LLM output.

## Approvals

**Ask Deepanshu first (write the request in `docs/PROGRESS.md` under "Waiting for Deepanshu", then go on with other work that doesn't depend on it):**
- any write to MongoDB Atlas outside the test suite, and any script run with `--apply`;
- `git push`, and any history rewrite (`reset --hard`, `rebase`, force operations, branch deletion);
- deleting user data or any collection;
- changing a locked v1 grade or the v1 scoring code;
- signing up for, or spending money on, any external service, or adding a paid dependency;
- live LLM calls beyond the budget below;
- creating or rotating real credentials;
- loosening the guard hook or a security check (tightening needs no approval).

**These need no approval. Do them freely:**
- reading any file in the repo;
- running and re-running tests, builds, linters and evals;
- retrying a failed command or request that is safe to repeat;
- downloading public market data (data.binance.vision, public REST market endpoints);
- web research and documentation lookups;
- creating, editing and deleting files in the working tree;
- adding pinned open-source dev dependencies;
- writing plans, ADRs and research notes;
- **committing locally at the end of each milestone** (rules below).

**Written permission from Deepanshu for this run:**
1. **Local commits.** In Milestone 0, change `.claude/hooks/guard.sh` so `git add` and `git commit` are allowed while push, history rewrites and force operations stay blocked (add test rows for both).
2. **Attribution.** Set `"attribution": false` in `.claude/settings.json` (hides commit attribution; requires Claude Code v2.1.281+. On older versions, set `commit` and `pr` to "" and `sessionUrl` to false).
3. **Commit rules:**
   - Commits carry only Deepanshu's git identity.
   - No AI co-author trailers, no "generated with" lines, and never the word "claude" in a message (a commit-msg hook enforces this).
   - Messages are short, casual, human one-liners.
   - Commit once per milestone, or per coherent unit of work inside one, and **only with every suite green.**
4. **Read access** to the demo generator, the seed scripts and `ml-service/whale/*.py` is permitted. Running them stays behind the approval list.

**Live LLM budget:** at most 5 Council runs per session, run through the existing recording and verification path. Larger runs, such as the full ablation re-record after the demo rebuild, are prepared as scripts with a dry-run and listed for Deepanshu to run; the Groq free tier allows about 8 full runs a day.

## Milestones

The milestones below are a direction, not a cage. Research first, then reorder within dependencies, merge, split, add or cut, as long as each change serves the three pillars and you record why (an ADR for anything significant, and a line in `docs/ROADMAP.md`).

**Each milestone is a substantial, shippable increment.** Don't break it into tiny steps for reporting. It ends with all suites green, docs updated, a local commit and a milestone report.

**M0. Orientation, research and hygiene**
- **Read the codebase end to end.**
- **Run the full suites and record the baseline.**
- **Market and technical research:** the current TCA landscape (Bloomberg BTCA public materials, Talos, CoinRoutes, Kaiko, Botminds, open-source tools such as tcapy), crypto-specific execution research, MiCA Art. 78 and SEC Rule 605 practice, retail cost studies, what traders actually complain about, and what would make FillScore clearly better. Write it up in `docs/research/MARKET_2026-11.md`, with sources.
- **Propose improvements and new features** grounded in that research. Update `docs/ROADMAP.md` with what you'll add, change or drop, and why.
- **Clean up accumulated instructions.** Review `CLAUDE.md`, the agent notes and the memory or instruction files for cautions whose reason no longer holds. Rewrite absolute rules so they state their scope and reason (the guard and the invariants stay).
- **Make the guard change** above.
- **Create `docs/PROGRESS.md`.**

**M1. Measurement v2 and Scoring v2 (the core)**
- The measurement layer from the spec and the 4R-1a plan:
  - aggressor-side quotes from real aggTrades (prints strictly before the fill, a 5 s staleness limit, microsecond timestamps in data.binance.vision spot files from 2025);
  - effective/realized spread, price impact and E/Q;
  - order reconstruction, order-level implementation shortfall with opportunity cost, and resting time;
  - the account's real fee rates;
  - lineage on every number, the field registry, an idempotent job with an outbox.
- Then Scoring v2 (spec §6): data-derived anchors and hour profiles, a minimum sample of 20 fills, bootstrap intervals, ScoringVersion plus an integrity hash, `/api/audit/verify`, and a `/methodology` page generated from the metric registry.
- The UI shows v1 ("rule-based") vs v2 ("measured") honestly.

**M2. Real demos**
- Rebuild the demo population from real public prints: taker fills walk real aggressor-side prints; maker fills come from real prints reaching the limit price; orders are recorded. Use a fixed seed.
- Re-grade under v2, re-lock the grades and document the old and new grades side by side. v1 stays reproducible.
- Rebuild demo-bybit/okx/multi from each venue's public trade archives where they exist (verify them); otherwise remove them.
- Re-run the whale study with only pre-fill bursts counted as adverse, and report the result whichever way it comes out.
- Prepare the full ablation re-record on golden set v2 as a script for Deepanshu.

**M3. Cost against expectation, and the AI layer's quality**
- Expected cost per order: square-root impact calibrated on public data, a gradient-boosted residual, and conformal intervals (MAPIE or crepes). Show "insufficient data" instead of false precision.
- Quick audit (single call, the default) and Deep audit (Council, opt-in, budgeted).
- **Find out why `evidence_cited` fails on every run, and fix the cause.**
- A free-tier budget engine: packet-hash caching, budgets, model fallback, graceful degradation.

**M4. Explain and act**
- A full cost decomposition per order.
- Noise-aware rankings ("too few to tell").
- An exception queue with review states.
- Trade replay with source-linked figures.
- Grounded one-line exception explanations.
- An integrity "verified" badge.
- A matched, honest venue comparison.

**M5. Trust and reach**
- Signed evidence packs (Ed25519 manifest plus a verify page).
- A best-execution evidence pack, worded "supports your documentation", never "compliant".
- A read-only FillScore MCP server.
- "Ask your execution": an agent over deterministic tools only.
- A prompt-injection red-team in CI (Promptfoo or equivalent).
- Rate limiting and caching.
- Privacy-safe product analytics.

**M6. Breadth**
- A CCXT adapter (shadow mode against the native Binance connector first), which also gives Bybit/OKX full history.
- CSV import with a hidden-cost checker for broker-style apps (Coinbase/Kraken exports: fill price vs the public mid at that second).
- Perpetual funding costs.
- Scheduled re-sync with a stale-data indicator.
- Lint debt.

**M7. Differentiators**
- A zkTLS feasibility spike (Reclaim / TLSNotary) for verifiable scorecards. Report feasibility honestly before building anything.
- An MCP App (an interactive scorecard inside AI clients).
- An EVM DEX wallet audit with MEV/sandwich patterns, labelled "pattern consistent with", never accusations.
- Differentially private market baselines.
- An open-source `fillscore-metrics` package.

**M8. Design and UI: stop here and tell Deepanshu before starting.** It's a collaborative phase. Prepare a design-system proposal and a screen inventory, then wait for him.

**M9. Launch readiness**
- A security review (OWASP top 10, dependency audit, secrets scan, key-handling review).
- A k6 smoke test.
- README and ARCHITECTURE refresh.
- Blog-post drafts (one per pillar), a demo script and video plan, and launch-channel drafts.
- Stripe billing prepared behind a feature flag, off until real users exist.
- A final audit of every claim in the copy against the code.

**Track R runs alongside every milestone.** Append findings, numbers (each with its source and command), limitations and decisions to `docs/research/` as you go; the paper will be written from it at the end. Keep the claim honest: guardrails vs agent count, measured on real fills once they exist.

## Real data without real trades

Deepanshu has not traded yet; he will later. Until then:
- **Use real public market data for everything you measure.** Tests run offline against small committed real slices, with their source checksums.
- **Consider Binance Spot Testnet** (testnet.binance.vision) for an end-to-end check of the connectors, onboarding and sync with a real API and no money. Testnet prices are not mainnet prices, so tag testnet data `testnet`, never score it as real execution quality, and never mix it into benchmarks. Testnet keys need Deepanshu: add the request to "Waiting for Deepanshu", with exact steps.
- **Build the real-account validation harness now,** so validating v2 on his first real trades is one command. That validation closes M1's real-account check later; don't fake it.

## How to work

**Plan, then build, then verify.** For each milestone, write a plan in `docs/superpowers/plans/` with:
- the files and interfaces;
- the tests, with hand-computed values;
- the edge cases a real user would hit.

**Build test-first.** A test's hand values are ground truth: fix the code, not the test. **Show each red phase** in your notes.

**Verify before claiming done:**
- **The full suites:**
  - backend tests and `tsc --noEmit`;
  - frontend tsc, vitest, lint and `npm run build`;
  - `pytest -q`;
  - `npm run test:e2e`;
  - `bash .claude/hooks/test_guard.sh`;
  - `python evals/run_offline.py` and `python evals/ablation.py --check`;
  - `bash scripts/check_roadmap_ids.sh`;
  - locally, `python -m evals.dump_golden_packets --check v2` whenever packets change.
- **"No crash" is not proof.** For any live Council run:
  - sweep the output for `failed:`, `Max retries`, `_default_`, `429`, `rate limit`, `RouterExhausted`, `REJECTED` and `fell back`;
  - confirm `n_calls == 9` on the persisted run;
  - check freshness (`user_id`, `created_at`);
  - read the actual text.

**Review.** At the end of each milestone, start an independent reviewer subagent on the diff, give it the milestone's goals, and fix its high and medium findings before you commit.

**Subagents cost real tokens,** and on this plan they share Deepanshu's usage limits. Use them where they clearly pay off:
- an independent review;
- a broad search across many files;
- docs research that needs citations;
- truly parallel independent work.

Run bulk or mechanical work on a cheaper model. Give each subagent a complete brief: goal, files, constraints, how to verify, and what to report. Do the main reasoning yourself.

**Finishing work.** Please avoid stopping while you still owe work the user asked for. Be persistent and do not stop unless needed.

While status notes are welcome, as is clarifying with the user on open decisions, carry on with work that does not depend on the user's answer without unnecessary stops.

If you notice yourself inviting the user to redirect you or offering to wait, instead proceed on the next part of the task. You may meet ordinary obstacles like errors, timeouts, locked files, empty results or failing tools. Diagnose them first, and when they are not real blockers, work through them with the access you have (wait and retry, fix the request, use another tool or source) rather than stopping unnecessarily.

If someone clearly decided something is a hard blocker, such as a file marked not to be touched, access that was intentionally withheld, or a safety guardrail, leave it alone, say plainly what you found, and look for another safe way to finish the task. Stopping before the task is complete is very rarely merited, as in when the task can't move forward without user input, or where the blocker is deliberate and should not be worked past. This does not override the need for confirmation on risky or destructive actions.

The guard hook is one of those deliberate guardrails. When it blocks a command, don't reach the same effect another way; use the tool it names (for example Write/Edit instead of shell redirection), or record the block in PROGRESS.md and move on.

**Keeping Deepanshu informed.** Before you start, say in a line what you're about to do. Brief updates while you work help the user follow along. Every few tool calls, give a one-line update on where things stand. Close with a short recap that stands on its own (what you found, what you did, and what's next), so a reader who only sees the last message has the full picture.

## Resuming

Keep `docs/PROGRESS.md` current. Update it at every milestone step, not only at the end. It holds:
- the current milestone and step, and the next concrete action;
- what is done (with commit hashes);
- **Waiting for Deepanshu:** each item with its exact command or steps, and what it unblocks;
- decisions taken since the last report;
- known problems.

A new session starts by reading this brief, then `docs/PROGRESS.md`, then `docs/HANDOFF.md`, and continues from "next concrete action". Never redo finished work, and never rely on memory of an earlier session that isn't in the files.

## Milestone reports

At the end of each milestone, write `docs/milestones/M<n>.md`, and keep `docs/HANDOFF.md` short and current.

**Communicating clearly.** Write for an intelligent but low-context reader. The person reading has not seen your tool calls, your reasoning or the files you opened, and may be switching in from other work. Messages should generally be self-contained: the reader should understand what you mean without having to dig for other context. Put the key points in the first few sentences. Practice progressive disclosure in your sentence order, and do not use undefined references and ideas in line 1 that won't make sense until the reader reaches line 12.

Use plain words, and write in clear, understandable full sentences. Do not use a term or abbreviation that you made up during the work. Say what the thing is in a way any reader would understand. Write mostly in the style of ASD-STE100 Simplified Technical English: short sentences, one idea per sentence, active voice, and consistently using the same word for the same thing. Use a paragraph of flowing prose where ideas connect, and keep bullets for lists of separate items. Leave out unnecessary details unless the reader asks and practice concision, but do ensure that your messages have the key context. Aim to make your user-facing text as human-readable and clear as possible.

**Each report covers:**
- what the milestone delivered for a user;
- the measured results, with numbers and their sources;
- what changed in the plan, and why;
- the test counts before and after;
- review findings and how they were fixed;
- the commit hashes;
- what's waiting for Deepanshu.

## When everything is done

When M9 is complete (M8 excepted, until Deepanshu has run it with you), write a final report:
- what FillScore is now;
- how each pillar is met, with evidence;
- what's honestly still missing;
- the exact steps for Deepanshu to launch: pushes, Atlas runs, the real-trade validation, keys and services.
