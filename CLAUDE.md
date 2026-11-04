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
- Council LLMs: Groq free tier via `ml-service/agents/llm_client.py` (default `openai/gpt-oss-120b`,
  override with `GROQ_SPECIALIST_MODEL` / `GROQ_SYNTHESIS_MODEL`). The Llama models are retired.
  LLM budget is $0. `run_consistency_eval` inter-run sleep stays at 65 s.

## Test commands (run the whole tier; read the summary line)

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
# backend (MONGOMS_SYSTEM_BINARY= overrides a Windows mongod path in backend/.env.test)
cd backend && MONGOMS_SYSTEM_BINARY= JWT_ACCESS_SECRET=test1 JWT_REFRESH_SECRET=test2 \
  GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x \
  npm test -- --no-file-parallelism && npx tsc --noEmit
# frontend: all three; build and tsc catch bugs the tests cannot
cd frontend && npx vitest run && npx tsc --noEmit --incremental false && npm run build
# ml-service (pytest.ini already excludes integration tests)
cd ml-service && GROQ_API_KEY=bogus OPENROUTER_API_KEY=bogus MONGODB_URI=mongodb://127.0.0.1:1/x \
  .venv/bin/pytest -p no:cacheprovider
```

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

- Mongo stores camelCase (`whaleAdverse`). `council_runs.created_at` is an ISO-8601 **string**
  (query by prefix); `trades.executedAt` is a native datetime.
- Trades store native `fee` in `feeAsset`; use `feeUsd` for any USD fee math.

## Pointers

- `ARCHITECTURE.md`: current system map (route table is test-enforced).
- `ROADMAP.md`: the only roadmap. Read just the section for your task ID (`T*`, `AC-*`, `R5-*`, `R6-*`).
  Older roadmap files are superseded; don't read or cite them.
- `.work/`: local-only (gitignored) briefs, audit, reports and logs. Never commit it.
