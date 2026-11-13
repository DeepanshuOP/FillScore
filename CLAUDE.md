# FillScore

Crypto Transaction Cost Analysis. It **grades past execution quality** against real market
microstructure. It never predicts, never signals, never advises.

## Start of every session

Read, in this order: `docs/agent/MASTER_BRIEF.md` (direction, invariants, approvals), `docs/PROGRESS.md`
(current milestone and the next concrete action), `docs/HANDOFF.md` (short current state). Continue from
the next action in PROGRESS. Never rely on memory of an earlier session that is not in the files.

## Product rules (non-negotiable; they restate invariants I1–I8 of the master brief)

1. **Audit the past only.** A feature that tells a user what a future trade will do is out of scope.
   Copy is past-tense findings, never advice ("could save", "route flow to" are wrong). This is also
   the legal line between an audit and investment advice.
2. **An LLM never originates a number.** Every number shown to a user comes from deterministic
   TS/Python code. LLMs may label, argue and explain. Overwrite or drop any LLM-emitted number.
3. **Exchange keys are read-only and encrypted.** Validation rejects any key with trade/withdraw
   rights before storage; secrets are AES-256-GCM at rest and never logged or returned.
4. **Provenance is immutable.** `dataSource: 'synthetic-demo' | 'real-user'` is set once. Demo trader
   *behaviour* is synthetic. Demo prices are real only where stated: see `docs/ROADMAP.md` §0 "Demo data"
   for what is real today. Demo accounts (`demo-*`) are read-only.
5. **Published grades never change silently.** Scoring v1 (`backend/src/scoring/`) is frozen: do not
   change its weights, formulas or code, and do not move a locked grade. Either needs Deepanshu's
   approval first. New scoring is a separate, versioned score beside v1. The locked v1 demo grades,
   checked by `gradeInvariance.test.ts`:
   `demo-disciplined` 95.88542572161496 (A), `demo-moderate` 84.80888516669383 (B),
   `demo-aggressive` 60.67469266790485 (C). (`demo-bybit`, `demo-okx` and `demo-multi` were removed from the
   product on 2026-11-13 by Deepanshu's decision; they are no longer published.)
6. **No fabricated data.** A value that cannot be measured is shown as "insufficient data". Recorded
   LLM output is never edited.
7. **Correlation, never causation.** Copy says "coincided with", never "caused" or "due to".
8. **Free tier first.** No paid service or dependency without Deepanshu's approval.

## Environment (WSL / Linux)

- Work in `~/FillScore` (WSL filesystem).
- Node 20 (`.nvmrc`, via nvm), Python 3.11 in `ml-service/.venv` (uv). Matches Docker/CI/Render.
- Ports: frontend Next.js 3000 · backend Express 3001 · ml-service FastAPI 8000 · MongoDB Atlas `fillscore`.
- Run everything: `scripts/dev.sh` (logs in `.work/logs/`, Ctrl-C stops all three). Prefix
  `MONGODB_URI=mongodb://127.0.0.1:<port>/x` to point at a local mongod instead of Atlas.
- Council LLMs: free tiers routed by `ml-service/agents/llm_router.py` from `ml-service/config/llm_routes.yaml`.
  LLM budget is $0 (details in `.claude/rules/ml-service.md`).

## Test commands

Per-tier commands live in `.claude/rules/{backend,frontend,ml-service}.md` and load when you work in
that tier. The full list of suites that must be green before a milestone is done is in the master
brief ("Verify before claiming done"). Run the whole tier and read the summary line.

## Working rules (each with its scope and reason)

- **Git.** Local commits are allowed: `git add <explicit files>` then `git commit`, once per milestone
  or coherent unit, and only with every suite green. Never `git add .`/`-A`/globs (reason: `.work/` and
  env files must not be staged by accident). Messages are short, human one-liners with no AI
  attribution (`.githooks/commit-msg` rejects it). **Pushes and history rewrites need Deepanshu**
  (reason: a push deploys to production through CI).
- **Secrets.** Never print or log one. Do not read `.env*`; check env vars by key name or non-empty
  only. No credential in any script, even temporarily. Reason: the repo is public and logs are shared.
- **Atlas and the demo dataset.** No write to MongoDB Atlas outside the test suite, no `--apply`, and
  no run of the seed, index, purge or backfill scripts in `backend/src/scripts`,
  `ml-service/whale/enrich.py` or `regen_fills.py` without Deepanshu's written permission. Reason: such
  runs have corrupted the locked demo dataset before. Reading these files is allowed.
- **Guard hook.** `.claude/hooks/guard.sh` enforces the three rules above. When it blocks a command,
  do not reach the same effect another way: use the tool it names, or record the block in
  `docs/PROGRESS.md`. Never edit `.claude/hooks/*` or `.claude/settings*.json`; propose changes as
  files under `.work/proposed/`. The guard also blocks shell redirection into the repo, so write files
  with the Write/Edit tools.
- **TDD with hand-computed fixtures.** Red, then green. Show the arithmetic in a comment. Fixture
  values are ground truth: fix the code, never the test. Don't mock to make a test pass.
- **External facts are cited.** Exchange API shapes, fee formulas, timestamp units and paper formulas
  come from official docs or the paper, with the source recorded.
- Verify before claiming done. "No crash" is not proof (see `docs/ROADMAP.md` §7).

## Data facts

- Mongo stores camelCase (`whaleAdverse`). `trades.executedAt` is a native datetime.
- Trades store native `fee` in `feeAsset`; use `feeUsd` for any USD fee math.
- Every persisted Trade field has one owner in `shared/fieldRegistry.json`; a new field needs a row.

## Pointers

- `ARCHITECTURE.md`: current system map (route table is test-enforced).
- `docs/ROADMAP.md`: the only roadmap. Read just the section for your task ID. The root `ROADMAP.md`
  is a one-line pointer to it.
- `docs/research/`: findings, experiments, ADRs and related work. Append-only (see its README). Every
  milestone appends its research notes to `docs/research/LOG.md`.
- `docs/milestones/`: one report per finished milestone.
- `.work/`: local-only (gitignored) briefs, older reports and logs. Never commit it.

## Subagents

The main session plans, computes expected values, verifies and reports. Subagents share Deepanshu's
usage limits, so use one only where it clearly pays off: `reviewer` for an independent review of a
milestone diff, `docs-researcher` for cited external facts, `Explore` for a broad search,
`implementer` for a fully specified, self-contained change, `test-runner` to keep long logs out of
context. Give each a complete brief: goal, files, constraints, how to verify, what to report.

## Compact instructions

When compacting, preserve: the current milestone and step from `docs/PROGRESS.md`, files changed so
far, test commands and their latest summary lines, and open questions.
