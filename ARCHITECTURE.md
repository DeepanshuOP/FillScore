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
              ├─► Binance / Bybit / OKX (read-only keys)      └─► Groq (llama-3.3-70b-versatile)
              └─► Binance public klines (arrival price, VWAP, spread proxy)
```

| Tier | Stack | Responsibility |
|---|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, Recharts | UI, auth state, SSE client for the Council |
| Backend | Node 20, Express 4, Mongoose 8, zod, PDFKit | Auth, exchange sync, scoring, audits, exports |
| ml-service | Python 3.11, FastAPI, LangGraph, Motor/PyMongo | Agent Council, evaluation harness, whale analysis |

Identity is always taken from the JWT (`resolveAccount`), never from a request parameter. The only
parameter that selects an account is `userId=demo-*`, and only the six known demo slugs are accepted.

## 2. Backend (`backend/src`)

| Path | Purpose |
|---|---|
| `app.ts` | `createApp()` builds the Express app (used by `index.ts` and by tests) |
| `index.ts` | Loads env, connects to Mongo, listens |
| `config/` | `env.ts` fail-fast env validation, `ingestion.ts` (symbols, window), `versions.ts` (`SCORING_VERSION`), `passport.ts` |
| `middleware/` | `security.ts` (helmet, CORS, rate limiters), `csrf.ts` (Origin check), `requireAuth.ts`, `resolveAccount.ts` (incl. `resolveDownloadAccount`), `errorHandler.ts` |
| `routes/` | `auth`, `audit`, `onboarding`, `attribution`, `preflight`, `health`, `connect` (retired, answers 410) |
| `services/` | Exchange clients (`BinanceClient`, `BybitClient`, `OKXClient`), `keyValidation` (read-only checks), `TradeIngestionService`, `SyncService`, `MarketDataService`, `ReportService` (PDF), `authService`, `oauthService`, `oauthCodeService`, `emailVerificationService`, `passwordResetService`, `emailService` |
| `scoring/` | `engine.ts` (per-trade score), `audit.ts` (account summary), `attribution.ts` (cost decomposition), `history.ts` (snapshots), `coach.ts` |
| `validation/` | zod schemas and `parseOrReject` |
| `utils/` | `encryption.ts` (AES-256-GCM), `jwt.ts`, `downloadToken.ts`, `password.ts`, `cookieConfig.ts`, `listRoutes.ts` |
| `scripts/` | Seeding, backfills, probes. Several are destructive; read before running |

### Scoring

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

All are per IP and held in memory, so they are per instance. See the gaps below.

### API surface

Generated from the app (`npm run docs:routes`).

| Method | Path |
|---|---|
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
| POST | `/api/connect/` |
| GET | `/api/health` |
| POST | `/api/onboarding/connect` |
| POST | `/api/onboarding/sync` |
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
| POST | `/ml/agents/council` | Run the Council, return the full result |
| POST | `/ml/agents/council/stream` | Same run, streamed as server-sent events |
| GET | `/ml/agents/council/runs` | Past runs for the account |
| GET | `/ml/agents/council/runs/{run_id}` | One persisted run |
| GET | `/ml/agents/council/telemetry` | Token and latency summary |

Pipeline: deterministic metric packets (`agents/metrics`) → four specialists (liquidity, fee, alpha,
risk) → bounded two-round prosecution/defense debate → synthesis → verification gate that recomputes
every claimed saving → grounding check that every cited number exists in a packet. Errors reach the
browser only as typed codes (`RATE_LIMIT_EXHAUSTED`, `DB_UNAVAILABLE`, `NO_DATA`, `INTERNAL`) with
fixed messages. A run budget (`config/budget.py`) refuses runs past the free-tier allowance instead
of letting a mid-run 429 degrade the result into default verdicts. `config/env_loader.py` fixes env
precedence: real environment, then `backend/.env` for shared keys, then `ml-service/.env`.

## 4. Frontend (`frontend/app`)

| Route | Purpose |
|---|---|
| `/` | Landing page, demo account cards |
| `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | Account flows |
| `/onboarding` | Connect Binance, Bybit or OKX with a read-only key, then sync |
| `/dashboard` | Score, attribution, trend from stored history, coach, Council |
| `/analytics`, `/trades` | Deep dive, trade blotter, CSV export, trade notes |
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
| `marketcaches` | Kline cache, 24 hour TTL |
| `council_runs` | Persisted Council runs (written by ml-service; `created_at` is an ISO string) |

`dataSource` (`synthetic-demo` or `real-user`) is set once and enforced at schema level. Only trader
behaviour in the demo accounts is synthetic; market data and whale data are real.

Canonical demo scores: `demo-disciplined` 95.885 (A), `demo-moderate` 84.809 (B),
`demo-aggressive` 60.675 (C), `demo-bybit` 76.164 (B), `demo-okx` 81.659 (B), `demo-multi` 70.720 (C).

## 6. Build status

| Area | State |
|---|---|
| Scoring engine, audits, history, analytics, attribution | Built |
| Binance, Bybit, OKX connection with read-only key verification and one shared sync path | Built; Bybit and OKX key checks follow each exchange's documented permission fields and have not been run against live keys |
| Auth: JWT, rotation, OAuth, CSRF origin check, email verification, password reset | Built |
| PDF and CSV for signed-in users | Built (link tokens) |
| Agent Council, evaluation harness, cost telemetry | Built |
| CI (backend, frontend, ml-service tests, typecheck, frontend build) | Built (`.github/workflows/ci.yml`) |
| Whale correlation | Sample accounts only; connected accounts get an explicit "unavailable" response |

## 7. Known gaps

- **ml-service is not deployed** and the Railway region is geo-blocked by Binance (HTTP 451). See ROADMAP §3.
- **Council replay** endpoint does not exist; runs are persisted but not replayable.
- **State is per instance:** rate limiters and the Council run budget live in memory. Running more
  than one instance needs a shared store (ROADMAP R5-C8).
- **No billing, quotas per plan, or GDPR export/erasure endpoints** (ROADMAP R5-C4, R5-C5).
- **No observability** (error tracking, traces, Council run tracing) (ROADMAP R5-C9).
- **No prompt-injection isolation layer** beyond the Council only receiving numeric packets, and no
  `ENCRYPTION_KEY` rotation tooling (ROADMAP R5-C2, R5-M1).
- **Field-name drift risk:** the ml-service loader projects `vwap5m` while the Trade model stores
  `vwap5min`; nothing writes `vwap5m`. Fixing it changes packet contents and hashes, so it is held
  until the evaluation is re-run.
- **Git history** contains credentials from before they were moved to the environment. They are
  rotated; whether to purge history before the repository goes public is an open decision
  (ROADMAP R6-G13).
