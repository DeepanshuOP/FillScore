# Architecture

FillScore grades **past** crypto execution quality against real market microstructure. It does not
predict, signal, or advise. Every number shown to a user comes from deterministic code; language
models only label, argue, and explain (the Grounding Contract).

This file describes what is in the code today. The route tables are checked against the running app
by `backend/src/__tests__/architectureDocs.test.ts`, so a route cannot be added or removed without
this file changing. Regenerate the backend table with `npm run docs:routes` in `backend/`.

## 1. Shape of the system

```text
 Browser ──► Next.js frontend (:3000, Vercel)
              │   REST + cookies                       SSE (council stream)
              ▼                                              ▼
        Express API (:3001) ───── MongoDB Atlas ◄───── FastAPI ml-service (:8000)
              │                    (db: fillscore)            │
              ├─► Binance / Bybit / OKX (read-only keys)      ├─► Groq / Gemini free tiers (llm_routes.yaml)
              │    └─ after each sync: POST /internal/measure  └─► Binance public data: REST aggTrades and 1m klines
              │       and /internal/score-v2 (service token)        (no key); data.binance.vision daily files (offline)
              └─► Binance public klines (arrival price, VWAP, spread proxy; v1 enrichment)

 AI client ──► mcp-server (stdio) ──► Express API (personal read-only API key; GET on six routes only)
```

| Tier | Stack | Responsibility |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, Recharts | UI, auth state, SSE client for the Council, browser-side check of evidence packs |
| Backend | Node 26, Express 4, Mongoose 8, zod, PDFKit | Auth, exchange sync (button and schedule), v1 scoring, audit and explain routes, evidence packs, API keys, exports |
| ml-service | Python 3.11, FastAPI, numpy, LangGraph, PyMongo | Measurement v2, Scoring v2, expected cost, Agent Council and Ask, broker-file check, evaluation harness |
| mcp-server | Node 26, MCP SDK | A read-only MCP server and the scorecard MCP App |
| packages/fillscore-metrics | Python, no dependencies | The measurement formulas, generated from the service code |

Identity is always taken from the JWT (`resolveAccount`) or a personal API key, never from a request parameter.
The only parameter that selects an account is `userId=demo-*`, and only the three known demo slugs are
accepted (`demo-disciplined`, `demo-moderate`, `demo-aggressive`).

## 2. Backend (`backend/src`)

| Path | Purpose |
|---|---|
| `app.ts` | `createApp()` builds the Express app (used by `index.ts` and by tests) |
| `index.ts` | Loads env, connects to Mongo, listens |
| `config/` | `env.ts` fail-fast env validation, `ingestion.ts` (symbols, window), `versions.ts` (`SCORING_VERSION`), `passport.ts` |
| `middleware/` | `security.ts` (helmet, CORS, rate limiters), `csrf.ts` (Origin check), `requireAuth.ts`, `resolveAccount.ts` (incl. `resolveDownloadAccount`), `errorHandler.ts` |
| `routes/` | `auth`, `audit`, `onboarding`, `attribution`, `preflight`, `health`, `connect` (retired, answers 410) |
| `services/` | Exchange clients (`BinanceClient`, `BybitClient`, `OKXClient`), `keyValidation` (read-only checks), `exchangeEgress` (outbound host allow-list, https only, no redirects), `binanceGovernor` (one request-weight budget for every Binance call; 429 pause, 418 ban), `TradeIngestionService` (a duplicate-key answer from a racing insert is counted as "already stored"), `SyncService`, `SyncJobService` (lock, status, freshness), `syncPipeline` (the steps of one background sync, shared by the button and the schedule), `resyncScheduler` (stale accounts, at most 3 a tick), `measureTrigger` (calls the ml-service after a sync), `MarketDataService`, `ReportService` (PDF), `evidencePack` and `signingKey` (Ed25519 packs), `apiKeys` and `reauth` (personal API keys), `orderSummary`, `exceptionQueue`, `orderReplay`, `rankWithNoise`, `venueComparison` (M4 explain routes), `ccxtShadow` (pure comparison with CCXT, offline), `authService`, `oauthService`, `oauthCodeService`, `emailVerificationService`, `passwordResetService`, `emailService` |
| `scoring/` | `engine.ts` (per-trade score), `audit.ts` (account summary), `attribution.ts` (cost decomposition), `history.ts` (snapshots), `coach.ts` |
| `validation/` | zod schemas and `parseOrReject` |
| `utils/` | `encryption.ts` (AES-256-GCM), `jwt.ts`, `downloadToken.ts`, `password.ts`, `cookieConfig.ts`, `listRoutes.ts` |
| `scripts/` | Seeding, backfills, probes. Several are destructive; read before running |

### Scoring

Two scores, labelled in the UI. **v2 (measured)** is computed by the ml-service from stored measurements (section 3) under a committed
version file (`ml-service/scoring_v2/versions/v2.3.0.json`): execution cost, fees and unfilled orders, equal weights; timing is reported
and not scored; at least 20 fills; a bootstrap band; an integrity hash that `GET /api/audit/verify` recomputes. The backend only stores
and serves it (`scores_v2`, `GET /api/audit/v2`), with the cost-vs-expected figure beside it (not part of the grade or its hash).
**v1 (rule-based)** is below; it is frozen and its published demo grades never change.

Four components, weights fixed in `scoring/engine.ts`: slippage 35%, fees 25%, timing 25%, spread 15%.
Grade bands: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F below. Account summaries sort trades by id before
aggregating so results are deterministic. `POST /api/audit/run` is the only writer of the canonical
`Audit` document (one per account, enforced by a unique index) and appends one immutable
`AuditHistory` row per run.

### Authentication and session handling

- Access token: JWT, 15 minutes. Refresh token: JWT in an HTTP-only cookie, 7 days, stored only as a
  SHA-256 hash, rotated on every use with family revocation on reuse.
- `/api/auth/refresh`, `/logout` and `/oauth/exchange` require a trusted `Origin` (or `Referer`).
- OAuth (Google, GitHub) never puts a token in a URL: the callback redirects with a 30 second,
  single-use code that the frontend exchanges for an access token.
- Email/password sign-ups receive a verification link. When a provider later claims the same
  address, an unverified password is discarded and its sessions are revoked.
- **Personal API keys** (ADR-0016) for the MCP server: `fsk_` + 8 hex + 43 base64url characters, shown once, stored as SHA-256 with a
  visible prefix, read-only (GET and HEAD on six routes), 90 days by default, revocable, 5 active per user, 60 requests a minute per key.
  Creating one asks for the password again. A key never reaches the routes that read a login token (`requireAuth`), so it cannot create,
  list or revoke keys, export the account or touch exchange connections. A password reset revokes the user's keys.
- Browsers cannot send `Authorization` on `window.open`, so PDF and CSV downloads use a one-minute
  link token (`POST /api/audit/download-token`) signed with a key derived from, but not equal to,
  the access secret.

### Rate limits

| Limiter | Window | Max | Applies to |
|---|---|---|---|
| global | 15 min | 600 | everything |
| `auditReadLimiter` | 15 min | 300 | all of `/api/audit/*` |
| `auditRunLimiter` | 15 min | 10 | `POST /api/audit/run` |
| `shareLimiter` | 60 min | 100 | `GET /api/audit/share/:userId`, `PATCH /api/audit/trades/:tradeId/note` |
| `authLimiter` | 15 min | 15 | sign-in, sign-up, reset, verify, exchange |
| `connectLimiter` | 15 min | 5 | `POST /api/onboarding/connect` |
| `availabilityLimiter` | 15 min | 20 | `/api/preflight` |
| sample file, per IP | 60 min | 3 | `POST /api/check/sample` (no login; the committed sample file through the ml-service check) |
| sample file, overall | 24 h | 200 | the same route, one count for everyone, run after the per-IP limit |

All are per IP and held in memory, so they are per instance. See the gaps below.

### API surface

Generated from the app (`npm run docs:routes`).

| Method | Path |
|---|---|
| DELETE | `/api/account/` |
| GET | `/api/account/export` |
| GET | `/api/keys/` |
| POST | `/api/keys/` |
| DELETE | `/api/keys/:id` |
| POST | `/api/billing/checkout` |
| POST | `/api/billing/webhook` |
| GET | `/api/attribution/` |
| GET | `/api/audit/` |
| GET | `/api/audit/analytics` |
| GET | `/api/audit/analytics/exchange-comparison` |
| GET | `/api/audit/analytics/whale-correlation` |
| GET | `/api/audit/coach` |
| POST | `/api/audit/download-token` |
| GET | `/api/audit/history` |
| GET | `/api/audit/report` |
| POST | `/api/audit/run` |
| GET | `/api/audit/score` |
| GET | `/api/audit/share/:userId` |
| GET | `/api/audit/trades` |
| PATCH | `/api/audit/trades/:tradeId/note` |
| GET | `/api/audit/trades/export` |
| GET | `/api/audit/v2` |
| GET | `/api/audit/orders-summary` |
| GET | `/api/audit/orders-ledger` |
| GET | `/api/audit/verify` |
| GET | `/api/audit/exceptions` |
| PATCH | `/api/audit/exceptions/:orderId` |
| GET | `/api/audit/orders/:orderId/replay` |
| GET | `/api/audit/rankings` |
| GET | `/api/audit/venue-comparison` |
| GET | `/api/evidence/public-key` |
| GET | `/api/evidence/pack` |
| POST | `/api/evidence/verify` |
| POST | `/api/analytics/event` |
| POST | `/api/auth/forgot-password` |
| GET | `/api/auth/github` |
| GET | `/api/auth/github/callback` |
| GET | `/api/auth/google` |
| GET | `/api/auth/google/callback` |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/me` |
| POST | `/api/auth/oauth/exchange` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/register` |
| POST | `/api/auth/resend-verification` |
| POST | `/api/auth/reset-password` |
| POST | `/api/auth/verify-email` |
| POST | `/api/check/sample` |
| POST | `/api/connect/` |
| GET | `/api/health` |
| POST | `/api/onboarding/connect` |
| DELETE | `/api/onboarding/connections/:exchange` |
| POST | `/api/onboarding/sync` |
| GET | `/api/onboarding/sync/status` |
| GET | `/api/preflight/exchanges` |
| GET | `/api/ready` |
| GET | `/api/version` |
| GET | `/health` |
| GET | `/ready` |
| GET | `/version` |

## 3. ml-service (`ml-service`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Model names and feature flags |
| GET | `/ready` | Mongo reachable and `GROQ_API_KEY` set |
| GET | `/version` | Service version |
| POST | `/ml/agents/council` | One audit, return the full result. Body `mode`: `quick` (one model call, no specialists; the dashboard default) or `deep` (the 9-call Council; the API default). Deep costs 9 budget units, Quick 1; a refused Deep run answers 429 with `quick_available` |
| POST | `/ml/agents/council/stream` | Same run, streamed as server-sent events (Quick: `synthesis_done`, `gate_done`, `complete`; Deep adds `cited_values` just before `complete`: each specialist's cited values traced to packet fields, `agents/cited_values.py`, computed on read, not stored) |
| GET | `/ml/agents/council/stream/{run_id}` | Resume a Council stream: only the events after `Last-Event-ID` (header, or `?lastEventId=`), never a new run. 404 `stream_expired` (unknown, expired or another account's run), 409 `unknown_event_id`. See "Resumable Council stream" in §7 |
| POST | `/ml/agents/ask` | Ask your execution: a question about the caller's own past executions, answered from deterministic tools only (planner call, tools, answerer call, code checks). 2 budget units; demo accounts refused |
| GET | `/ml/agents/council/budget` | What is left of the account's and the day's audit budget, in units, and whether one more Deep or Quick audit is allowed |
| GET | `/ml/agents/council/runs` | Past runs for the account |
| GET | `/ml/agents/council/runs/{run_id}` | One persisted run |
| GET | `/ml/agents/council/telemetry` | Token and latency summary |
| POST | `/internal/measure` | Measurement v2 of the account's pending fills and orders (service token `typ: measure` from the backend only; ADR-0011) |
| POST | `/internal/score-v2` | Score the account under the current Scoring v2 version and store it in `scores_v2` (same service token) |
| POST | `/internal/csv-sample` | Check the committed sample broker file (`csv_import/sample/kraken_sample.csv`) with the same check and market-data gate as `/ml/csv/check`; service token for the account label `sample-file` only; the backend's `POST /api/check/sample` calls it after its limits |
| POST | `/internal/verify-v2` | Recompute the stored v2 score's integrity hash from its stored inputs and the version file (same service token) |
| POST | `/ml/csv/check` | Check a broker file (`kraken` or `mapped`): each fill against the public price at its second. Signed-in accounts only (demo ids refused); 200,000 characters, 200 fills, 6 checks an hour and 20 a day per account, one at a time per account, 2 at once in the service; nothing stored; a 418 or 429 from the market-data source pauses all checks |

Measurement and scoring (`ml-service`): `measure/` is the measurement layer. Pure formulas (`metrics.py`, `orders.py`, `fees.py`, registered in
`registry.py`, which generates the methodology page); data (`data/`: data.binance.vision daily files with mandatory checksums, REST aggTrades
windows with a gap check, public 1-minute klines, a Parquet cache); `service.py` is the idempotent job (the trade rows are the outbox) that
measures fills and orders and stores them in `order_measurements` with lineage. `scoring_v2/` calibrates and applies the versioned score.
`expected_cost/` holds the square-root impact model, split conformal intervals and the hook that supplies the hour before an order (daily
files offline, klines in production). `csv_import/` reads broker files and compares fills with public prices. `dp_baselines/` is a tested
differential-privacy mechanism that no route uses. `demo_v2/` rebuilds the three demos from real prints (offline). The open-source
`packages/fillscore-metrics` is generated from `measure/` by `scripts/sync_metrics_package.py`.

Pipeline: deterministic metric packets (`agents/metrics`) → four specialists (liquidity, fee, alpha,
risk) → bounded two-round prosecution/defense debate → synthesis (structured recommendations) →
placeholder rendering (`agents/render.py`) + blocking grounding (`agents/grounding.py`: regenerate once,
then redact stray numerals) → counterfactual verifier (`agents/verification.py`, `agents/counterfactual.py`:
replay the user's trades, one forced re-reason, then drop) → persistence. Models come from
`agents/llm_router.py` and `config/llm_routes.yaml`. Errors reach the
browser only as typed codes (`RATE_LIMIT_EXHAUSTED`, `DB_UNAVAILABLE`, `NO_DATA`, `INTERNAL`) with
fixed messages. A run budget (`config/budget.py`) refuses runs past the free-tier allowance instead
of letting a mid-run 429 degrade the result into default verdicts. `config/env_loader.py` fixes env
precedence: real environment, then `backend/.env` for shared keys, then `ml-service/.env`.

Post-trade analytics (4a, additional only; never an input to the FillScore composite or the demo grades):
`marketdata/` fetches Binance public 1s klines (SHA-256 verified, disk cache) and reads the price at
t+1/5/30/60/300 s after each fill (`price_path.py`, staleness cap 5 s, else null). `agents/metrics/markout_packet.py`
(`markout.*`, sign: positive = price moved in the trader's favour) and `spread_estimators.py` (`spread.*`,
Corwin-Schultz and Abdi-Ranaldo, the smaller is used) feed `maker_instead_of_taker`, which is now
`0.5 * (fee + half-spread - adverse selection)` (`spread_aware=False` keeps the fee-only model). Per-trade fields
`postPrices`, `spreadBps`, `halfSpreadBps`, `markoutVersion` are written only by `scripts/backfill_markouts.py`
(dry run by default). The backend mirrors the markout convention in `backend/src/analytics/markouts.ts` for the
analytics card.
`FILLSCORE_TRACING=0` (set by `tests/conftest.py`) turns off Langfuse export and Sentry in tests.

## 4. Frontend (`frontend/app`)

| Route | Purpose |
|---|---|
Design system v3 "Tape & Receipt" (2026-11-20; rules in `DESIGN.md`; tokens in `app/ui/tokens.css`, themes `paper`
(default) and `carbon` through next-themes, storage key `fs-theme`; fonts Cabinet Grotesk and Departure Mono in
`app/fonts.ts`; printed objects in `app/ui/paper.css`, the landing hero in `app/ui/landing.css`). App screens render inside
`app/components/appshell/AppFrame.tsx` (IA v4: the persistent frame in the layout of `app/app/(shell)/`: a left sidebar of
nine nouns with the pen underline and a bottom group, a rail from 1024 to 1279 px, a bottom bar of four with a Vaul More
sheet on phones, the page header that prints provenance, account and period on every app page, the ⌘K `CommandMenu`).
Pages report their header with `AppPage` (`appshell/shellContext.tsx`) and own their data. Settings has its own shell
(`SettingsShell`, "Back"). The marketing site and the docs use `components/marketing/MarketingNav` (four items, Log in, Open
the demo; a Vaul Menu sheet on phones) and `SiteFooter` (Product, Docs, Trust, Legal). Old addresses answer 308 from
`frontend/legacyRedirects.mjs` (imported by `next.config.mjs`, tested). The feature code stays in its folders:
`app/dashboard/` (Home's `AskHome` and `HomeFigures`, Overview, Orders, Rules, Rankings, Evidence), `app/trades/` (Fills
Ledger), `app/analytics/` (Fills Patterns), `app/check/`, `app/settings/`, `app/onboarding/` (Connect). Primitives in `app/ui/` (ValueState, GradeChip as a small stamp, GradeStamp, Figure and SplitFigure with
NumberFlow, Button, Panel as a ledger block, PenMarks and the seeded strokes of `pen.ts`, `hash.ts`, charts in
`app/ui/charts/`: CostRuler, RankPlot); shadcn/ui components in `components/ui/`. The order receipt is
`app/dashboard/OrderReplay.tsx` (Radix Dialog on a desktop, Vaul on a phone); the overview's month tape is
`app/dashboard/MonthTape.tsx` (model `monthTape.ts`). The landing hero (`components/marketing/TapeHero.tsx`, geometry in
`heroGeometry.ts`, data in `app/lib/landing/heroData.ts` over `app/lib/landing/fixtures/`) renders its finished frame on
the server; GSAP (ScrollTrigger, DrawSVG, SplitText) and Lenis load on the landing page only, by dynamic import
(`components/marketing/v3/pinnedStory.ts`, `LandingMotion.tsx`). Motion's features (`app/motionFeatures.ts`, through
`LazyMotion`) and the Sonner toaster (`app/ThemedToaster.tsx`, `next/dynamic`) load after first paint. Visual QA:
`e2e-shots/qa3.ts` (36 states of the marketing site and the app, apps also at 320, Carbon copy, axe, overlap, landing CLS), `e2e-shots/look.ts` (one screen, break-ui cases), `e2e-shots/keys.ts`
(keyboard-only pass); the v2 scripts `qa.ts` and `break.ts` are kept for reference.

| `/` | Landing page: the tape hero of one real demo order (a printed label with the order's date, pen nib on a fine pointer, pinned story, pen annotations), the giant total, demo receipts, check it yourself, close |
| `/how-it-works` | The three printed objects (the tape, the receipt, the stamp), the landing's former pinned section |
| `/demo` | The choice of trader: three slips (name, line, orders, fills, period, total bps from the API, the synthetic line) |
| `/docs`, `/docs/mcp`, `/docs/package` | Docs hub; the MCP client runbook and the metrics package README, rendered from copies in `app/docs/content/` (drift-tested) |
| `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | Account flows |
| `/app` | Home, "Ask FillScore": a demo account plays recorded answers of the Ask agent (labelled, no input); a signed-in account with measured orders asks live (2 budget units a question); without measured orders Ask is disabled. Key figures under it: the total and the small grade stamp |
| `/app/overview` | The overview: the total, the grade stamp, where it went, the month tape, cost against expected and outcomes, the scope facts |
| `/app/orders` | The orders ledger (columns by screen width) and the thermal receipt (a Radix dialog on a desktop, a Vaul drawer on a phone; prints on the first open of a session) |
| `/app/rules`, `/app/rankings` | The exception queue with review states; the noise-aware rankings tape |
| `/app/council` | Quick and Deep Council |
| `/app/evidence` | Signed evidence packs, the record behind the grade, the rule-based (v1) details |
| `/app/fills` | Tabs Ledger (the fills, filters, CSV export, notes) and Patterns (`?tab=patterns`: the deep dive) |
| `/app/check` | The broker-file check; opens signed out and in demo mode, runs for a signed-in account |
| `/app/settings` | Account, connected exchanges, download or delete your data, evidence packs, personal API keys (its own shell) |
| `/app/connect` | Connect Binance, Bybit or OKX with a read-only key, then sync |
| `/dashboard`, `/trades`, `/analytics`, `/check`, `/settings`, `/onboarding` | Permanent 308 redirects to the pages above, the rest of the query kept (`legacyRedirects.mjs`) |
| `/verify` | Check a signed evidence pack in the browser (WebCrypto Ed25519, `@noble/ed25519` fallback); nothing is uploaded |
| `/methodology` | The method and the scoring version, generated from the code |
| `/design-lab` | Development only (404 in production): the design v3 prototypes (Tape & Receipt, Grid & Highlighter); the IA v4 prototype was deleted when IA v4 was built |
| `/share/[userId]` | Public score card for demo accounts, with Open Graph image |
| `/terms`, `/privacy` | Legal pages |
| `/api/preflight` | Server route that probes Binance, Bybit and OKX reachability from the frontend host |

## 5. Data model (MongoDB, database `fillscore`)

| Collection | Notes |
|---|---|
| `users` | Email, bcrypt hash or provider ids, `emailVerified`, `plan` |
| `refreshtokens`, `passwordresettokens`, `emailverificationtokens`, `oauthcodes` | Hashed, TTL-expired |
| `exchangeconnections` | One per account and exchange; key, secret and (OKX) passphrase are AES-256-GCM payloads |
| `trades` | Native `fee` and `notional`; `dataSource` immutable; `exchange` is `binance`, `bybit` or `okx` |
| `audits` | One canonical document per account (unique `accountId`) |
| `audithistories` | Append-only snapshots, edits refused, deletes allowed for erasure |
| `orders`, `fee_snapshots` | Binance orders and the account's commission rates, from the sync |
| `order_measurements` | One measurement per order (shortfall terms, `expectedCost`, lineage refs), written by the ml-service |
| `scores_v2` | Scoring v2 results with `costVsExpected` beside them, written by the ml-service |
| `exceptionreviews`, `analyticsdailies`, `syncjobs`, `api_keys` | Review states; anonymous daily counters; the sync lock and status; personal API keys (hash only) |
| `marketcaches` | Kline cache, 24 hour TTL |
| `council_runs` | Persisted Council runs (written by ml-service; `created_at` is an ISO string) |

`dataSource` (`synthetic-demo` or `real-user`) is set once and enforced at schema level. Demo trader
behaviour is synthetic. In the three Binance demos, MARKET fill prices come from real public prints,
while LIMIT fills are offsets from a real 1-minute open with slippage set to 0. M2 rebuilt the three Binance
demos from real prints (`ml-service/demo_v2/out/`); their trades carry no per-trade v1 fields, so every v1-only
view says "not computed for this data" and the measured views (`/api/audit/orders-summary`, v2 components) take
its place. `demo-bybit`, `demo-okx` and `demo-multi` were removed from the product on 2026-11-13 (their Atlas
data is kept; `demo-bybit` returns in M6 with Bybit measurement). Whale bursts and markout prices are real public data.

Orders ledger (design v3 fixes, 2026-11-21): `GET /api/audit/orders-ledger` (`services/orderLedger.ts`, computed on
read from `orders`, `trades` and `order_measurements`) returns `counts` {orders, withFills, fills, unrecorded} (the same
`orderCounts()` that `/api/audit/orders-summary` now returns as `counts`) and one row per stored order, filled or not,
then per group of fills without a stored order: status, placed time, first and last fill, fills, quantity, notional,
fees, maker share and `cost` {usd, bps} (totalBps x intendedNotional / 10,000, the receipt's formula; null if not
measured). The Orders ledger and the overview's month tape read it. Size for demo-moderate's 245 orders: 109,678 bytes,
20,482 gzip. `/api/audit/orders-summary` also returns `byType` {all, market, limit, other} (`totalsByType()`, the
shortfall totals per order type family; LIMIT_MAKER counts as limit; the families add up to `all` in dollars and
orders), read by the overview's All / Market / Limit switch. `summariseOrders()` (also in the evidence pack) is unchanged.

Canonical v1 demo scores (the frozen, published audits): `demo-disciplined` 95.885 (A), `demo-moderate` 84.809 (B),
`demo-aggressive` 60.675 (C).

## 6. Build status

| Area | State |
|---|---|
| Scoring engine, audits, history, analytics, attribution | Built |
| Binance, Bybit, OKX connection with read-only key verification and one shared sync path | Built; Bybit and OKX key checks follow each exchange's documented permission fields and have not been run against live keys |
| Auth: JWT, rotation, OAuth, CSRF origin check, email verification, password reset | Built |
| PDF and CSV for signed-in users | Built (link tokens) |
| Agent Council, evaluation harness, cost telemetry | Built |
| Measurement v2, Scoring v2.3.0, expected cost, explain routes, evidence packs and `/verify`, MCP server and API keys, broker-file check, scheduled re-sync | Built (reports in `docs/milestones/`) |
| Perpetual funding costs; EVM DEX wallet audit; cryptographic proof of where trades came from; CCXT for Bybit and OKX | Not built (`docs/PROGRESS.md` waiting items 16 and 19, `docs/research/ZKTLS_FEASIBILITY.md`); CCXT shadow comparison built, not yet run live |
| CI (backend, frontend, ml-service tests, typecheck, frontend build, gitleaks secret scan of the full history) | Built (`.github/workflows/ci.yml`) |
| Whale correlation | Sample accounts only; connected accounts get an explicit "unavailable" response |

## 7. Known gaps

Deployed: Render Frankfurt (backend and ml-service) and Vercel (frontend); see `docs/DEPLOY.md`.
Binance reachability from the host is checked by `scripts/smoke_prod.sh`. Error tracking (Sentry on
all three tiers) and Council tracing (Langfuse) are in place; see `docs/OBSERVABILITY.md`. GDPR export
and erasure are `GET /api/account/export` and `DELETE /api/account/`.

- **Scoring v1 is rule-based and partly inaccurate** (1-minute arrival proxy, high–low spread
  heuristic, hand-picked hours). See `docs/research/AUDIT_2026-11.md`; measurement v2 and Scoring v2
  are specified in `docs/superpowers/specs/2026-11-07-measurement-v2-design.md`.
- **Demo data is only partly real** (see §5). No real-user trade has been scored yet.
- **Council replay** endpoint does not exist; runs are persisted but not replayable.
- **Resumable Council stream (single instance).** Every Council SSE event carries an `id:` (1, 2, 3, ... per run); `agents/stream_store.py`
  keeps a run's events in this process's memory (at most 32 runs, 300 events each, a finished run for 10 minutes; an unfinished run is not
  expired) and the pipeline no longer depends on the connection that started it. The response header `X-Council-Run` names the run; a
  client that lost the connection calls `GET /ml/agents/council/stream/{run_id}` with `Last-Event-ID` and receives only the later events;
  a comment line (`: keepalive`) every 20 s keeps an idle stream open. **Limit:** the events live in one process. A restart or redeploy
  loses every unfinished run and all kept events, and a second instance would not know the first one's runs; the client then gets
  `stream_expired` and the page says the audit was not started again (a finished audit is still served from `council_runs`, by content hash).
- **State is per instance:** rate limiters, the API-key limiter, the CSV-check budget and the Council run budget live in memory, and the
  scheduled re-sync runs only while the free instance is awake. Running more than one instance needs a shared store (ROADMAP G1).
- **No billing or quotas per plan** (ROADMAP G3). Stripe is prepared behind `BILLING_ENABLED` (off): `POST /api/billing/checkout` and
  `POST /api/billing/webhook` answer 404 while it is off; the webhook verifies Stripe's signature and only sets `users.plan`. No Stripe
  account exists, so it has never met the real service, and no route checks the plan yet.
- **Prompt injection:** the Council receives numeric packets only; Ask answers come from deterministic tools with output guards that were
  red-teamed offline (113 cases, `docs/milestones/M5.md`); there is no `ENCRYPTION_KEY` rotation tooling (ROADMAP C6, G4).
- **Cost vs expected is fitted on January 2024 only;** the Kraken file reading is built from documentation and not yet checked against a
  real file; the MCP App has not been tried in a real client.
- **Bybit and OKX** connectors have not been run against live keys.
- **Git history** contains credentials from before they were moved to the environment. They are
  rotated, and the history is deliberately not purged (clones and forks keep it; ROADMAP R6-G13).
  The CI job `secrets` scans the full history with gitleaks (`.gitleaks.toml`, known findings in
  `.gitleaksignore`) and fails on any new finding.
