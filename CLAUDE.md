# FillScore

Crypto Transaction Cost Analysis. It **grades past execution quality** against real market
microstructure. It never predicts, never signals, never advises.

## Non-negotiable product rules

1. **Audit the past, never predict.** If a feature would tell a user what a future trade will do, it
   is out of scope. Say so and stop.
2. **LLMs may label, argue, and explain — never originate a number.** Every numeric value in any
   output traces to a deterministic Python/TypeScript computation. This is the Grounding Contract.
3. **Council output is never financial advice.** Copy must never imply otherwise.
4. **Provenance is immutable.** `dataSource: 'synthetic-demo' | 'real-user'` is set once, enforced at
   schema level. Only trader *behaviour* is synthetic; all market and whale data is real.
5. **Secrets come from env only.** Never print, echo, cat, or log `.env` contents. Confirm env vars by
   key name or non-empty check. Never hardcode a credential in a script, not even temporarily.

## Environment

- **Windows / PowerShell only.** Root: `C:\Users\SHREE\Desktop\FillScore\`
- Frontend Next.js :3000 · Backend Node/Express :3001 · ML FastAPI :8000 · MongoDB Atlas (`fillscore`)
- Dev startup: `start-dev.ps1` in a visible terminal (`-WindowStyle Hidden` dies with the session)
- **No local LLM.** The machine cannot run Ollama (Intel Iris Xe, ~15.7 GB). Never propose it.
- Agent Council runs on **Groq free tier**: `llama-3.3-70b-versatile` (specialists + synthesis),
  `llama-3.1-8b-instant` (bulk eval). 100K TPD / 30 RPM on the 70B. One run ≈ 11.6K tokens / 9 calls.
- `run_consistency_eval` inter-run sleep is **65s**. Never lower it (4s caused 429 contamination).
- Python Mongo needs `tlsCAFile=certifi.where()`. pip needs `--break-system-packages`.

## Commands

```powershell
# Backend tests
Push-Location backend; $env:JWT_ACCESS_SECRET="test1"; $env:JWT_REFRESH_SECRET="test2"; $env:GOOGLE_CLIENT_ID="x"; $env:GOOGLE_CLIENT_SECRET="x"; $env:GITHUB_CLIENT_ID="x"; $env:GITHUB_CLIENT_SECRET="x"; npm test -- --no-file-parallelism; Pop-Location

# Frontend — ALWAYS run all three; build and tsc catch bugs the tests structurally cannot
Push-Location frontend; npx vitest run; npx tsc --noEmit; npm run build; Pop-Location

# ML service
Push-Location ml-service; pytest; Pop-Location
```

## Data facts (do not re-derive)

- Canonical demo grades: `demo-disciplined` **95.88542572161496** (A), `demo-moderate`
  **84.80888516669383** (B), `demo-aggressive` **60.67469266790485** (C), `demo-bybit` 76.164 (B),
  `demo-okx` 81.659 (B), `demo-multi` 70.720 (C). *The 95.675 / 84.570 / 60.771 set is RETIRED.*
- ~931 seeded trades. Mongo stores camelCase (`whaleAdverse`); trades store native `fee`/`notional`.
- `created_at` on `council_runs` is an ISO-8601 **string** (query by prefix); `executedAt` is a native
  datetime (convert cutoff strings to naive datetime before `$lt`/`$gt`).
- **Never run `npm run seed` or any destructive script without explicit written permission.** It has
  corrupted the locked demo dataset before.

## Working rules

- **TDD with hand-computed fixtures.** Show the red phase, then the green phase. Fixture values are
  ground truth: fix the code, never the test. Never mock to make a test pass.
- **Surgical edits on existing files.** Show changed lines only. Full output on new files.
- **PowerShell syntax only.** Never bash.
- **Verify before claiming done.** "No crash" is not proof. Read the raw output; if the result is
  unexpected, stop and report rather than proceeding.
- **Never commit or push without explicit per-task authorization.** When authorized: explicit file
  lists (never `git add .`), and a short plain one-line message — no `feat:` prefixes, no changelog
  formatting.
- One task = one testable deliverable. Do not bundle unrelated work.
- Do not take screenshots.

## Roadmap

`ROADMAP.md` at the repo root is the **only** roadmap and it is self-contained. Read the section for
the task at hand — never load the whole file. Task IDs are stable anchors: `T1.x-T6.x` (original task
line), `AC-x` (Agent Council), `R5-x` (code-audit findings), `R6-x` (current additions).

There are no other roadmaps. If earlier files named `FillScore_Supreme_Roadmap_v2.md`,
`FillScore_Unified_Roadmap_v4.md`, `FillScore_Roadmap_v5.md`, or `FillScore_Roadmap_v6.md` are present
anywhere, they are superseded and contain known-wrong facts (retired demo grades, futures fee rates
mislabelled as spot, Ollama references, colliding task IDs). Do not read them. Do not cite them.

If ROADMAP.md appears to be missing something, say so and stop. That is a bug in ROADMAP.md and gets
fixed there — silently substituting an older document is how this project has lost work before.

`ARCHITECTURE.md` is currently **stale** (predates all of Phase 4 and lists already-rotated secrets as
open gaps). Do not trust it for build status until R6-D10 regenerates it. Verify against the code.
