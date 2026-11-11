# FillScore

Crypto Transaction Cost Analysis. It **grades past execution quality** against real market
microstructure. It never predicts, never signals, never advises.

## Product rules (non-negotiable)

1. **Audit the past only.** A feature that tells a user what a future trade will do is out of scope.
   Copy is past-tense findings, never advice ("could save", "route flow to" are wrong).
2. **An LLM never originates a number.** Every number shown to a user comes from deterministic
   TS/Python code. LLMs may label, argue and explain. Overwrite or drop any LLM-emitted number.
3. **Exchange keys are read-only and encrypted.** Validation rejects any key with trade/withdraw
   rights before storage; secrets are AES-256-GCM at rest and never logged or returned.
4. **Provenance is immutable.** `dataSource: 'synthetic-demo' | 'real-user'` is set once. Only demo
   trader *behaviour* is synthetic; market and whale data are real. Demo accounts (`demo-*`) are
   read-only.
5. **Locked demo grades** (do not change scoring weights/formulas to move them):
   `demo-disciplined` 95.88542572161496 (A), `demo-moderate` 84.80888516669383 (B),
   `demo-aggressive` 60.67469266790485 (C), `demo-bybit` 76.164 (B), `demo-okx` 81.659 (B),
   `demo-multi` 70.720 (C).

## Environment (WSL / Linux)

- Work in `~/FillScore` (WSL filesystem). The old Windows checkout under `/mnt/c/...` is retired.
- Node 20 (`.nvmrc`, via nvm), Python 3.11 in `ml-service/.venv` (uv). Matches Docker/CI/Render.
- Ports: frontend Next.js 3000 · backend Express 3001 · ml-service FastAPI 8000 · MongoDB Atlas `fillscore`.
- Run everything: `scripts/dev.sh` (logs in `.work/logs/`, Ctrl-C stops all three). Prefix
  `MONGODB_URI=mongodb://127.0.0.1:<port>/x` to point at a local mongod instead of Atlas.
- Council LLMs: free tiers routed by `ml-service/agents/llm_router.py` from `ml-service/config/llm_routes.yaml` (Groq; Gemini when `GEMINI_API_KEY` is set). LLM budget is $0 (details in `.claude/rules/ml-service.md`).

## Test commands

Per-tier commands live in `.claude/rules/{backend,frontend,ml-service}.md` and load when you work in
that tier. Run the whole tier and read the summary line. All three must be green before a phase is done.

## Working rules

- **No commits or pushes.** Deepanshu reviews and commits himself, with no AI attribution
  (`.githooks/commit-msg` rejects it). Never `git add .`/`-A`/globs.
- **Never print secrets.** No reading `.env*`; check env vars by key name or non-empty only. No
  credential in any script, even temporarily.
- **No seeding or destructive scripts** (`npm run seed`, the index/purge/backfill scripts in
  `backend/src/scripts`, `ml-service/whale/enrich.py`, `regen_fills.py`) and no Atlas writes without
  explicit written permission. They have corrupted the locked demo dataset before.
- **TDD with hand-computed fixtures.** Red, then green. Show the arithmetic in a comment. Fixture
  values are ground truth: fix the code, never the test. Don't mock to make a test pass.
- Surgical edits; one task = one testable deliverable. Verify before claiming done.
- `.claude/hooks/guard.sh` enforces the commit/secret/seed rules as a PreToolUse hook.

## Data facts

- Mongo stores camelCase (`whaleAdverse`). `trades.executedAt` is a native datetime.
- Trades store native `fee` in `feeAsset`; use `feeUsd` for any USD fee math.

## Pointers

- `ARCHITECTURE.md`: current system map (route table is test-enforced).
- `ROADMAP.md`: the only roadmap. Read just the section for your task ID (`T*`, `AC-*`, `R5-*`, `R6-*`).
  Older roadmap files are superseded; don't read or cite them.
- `.work/`: local-only (gitignored) briefs, audit, reports and logs. Never commit it.

## Working model

- The main session orchestrates: plans, writes specs, computes expected values, verifies, reports.
- `implementer` (Sonnet) does code changes from a full spec; `test-runner` (Haiku) runs suites.
- `reviewer` (Sonnet) reviews diffs; `Explore` (Haiku) searches; `docs-researcher` looks up docs.
- Escalate a worker to Opus only after two failed attempts or for algorithmically subtle items.
- Phases run with the `run-brief` skill; `handoff` writes `.work/HANDOFF.md` before a clear.

## Compact instructions

When compacting, preserve: the current brief path, the checklist file path and its status, files changed so far, test commands and their latest summary lines, and open questions.

## Research record
Start every session by reading docs/HANDOFF.md. Findings, experiments and decisions live in docs/research/ (append-only; see its README). Every phase report ends by appending its research notes to docs/research/LOG.md.

## Research record
Start every session by reading docs/HANDOFF.md. Findings, experiments and decisions live in docs/research/ (append-only; see its README). Every phase report ends by appending its research notes to docs/research/LOG.md.

## Research record
Start every session by reading docs/HANDOFF.md. Findings, experiments and decisions live in docs/research/ (append-only; see its README). Every phase report ends by appending its research notes to docs/research/LOG.md.

## Research record
Start every session by reading docs/HANDOFF.md. Findings, experiments and decisions live in docs/research/ (append-only; see its README). Every phase report ends by appending its research notes to docs/research/LOG.md.

## Master brief
Long-running work follows docs/agent/MASTER_BRIEF.md; progress and the next action live in docs/PROGRESS.md.
