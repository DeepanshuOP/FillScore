# Deploying FillScore

This is the only deploy guide. It replaces the Railway notes, the Oracle VM guide (`docs/PROD_DEPLOY.md`,
`docker-compose.prod.yml`, `deploy/Caddyfile`) and the hosting research in `docs/FREE_HOSTING.md`. Those files
are kept for history and marked as superseded. The first-real-user walkthrough is `docs/FIRST_REAL_USER.md`.

This page lists environment variable **names** only. Never put a value in this file, in `render.yaml` or in a commit.

## 1. Services

```
Browser ──▶ Vercel: frontend (Next.js)
              │  /api/*  rewrite ──▶ Render: fillscore-api  (backend, Express, Docker, Frankfurt)
              │                               │
Browser ──────┴─ Council stream, direct ─▶ Render: fillscore-ml   (ml-service, FastAPI, Docker, Frankfurt)
                                              │
                         both services ──▶ MongoDB Atlas (database `fillscore`)
```

| Service | Host | Region | Plan | Build | Port | Health check |
|---|---|---|---|---|---|---|
| `fillscore-api` (backend) | Render web service, from `render.yaml` | Frankfurt | free | `backend/Dockerfile` (context `backend/`): `npm ci`, `npm run build` (tsc), then a runtime stage with `npm ci --omit=dev`; runs `node dist/index.js` | `PORT` (Render injects it) | `/health` |
| `fillscore-ml` (ml-service) | Render web service, from `render.yaml` | Frankfurt | free (see memory below) | `ml-service/Dockerfile` (context `ml-service/`): `python:3.11-slim`, `pip install -r requirements.txt`; runs `uvicorn main:app --port 8000` | 8000 (`PORT=8000` is set in `render.yaml`) | `/health` |
| frontend | Vercel project, root directory `frontend/` | Vercel default | Hobby | `npm run build` (Next.js) | — | — |
| database | MongoDB Atlas | as today | as today | — | — | — |

**Why Frankfurt.** Binance has answered HTTP 451 (geo-restricted) to some US datacenter ranges. A European region is the
safer bet, but it is not proven until `scripts/smoke_prod.sh` reports Binance reachable from the deployed backend.

**Memory on the free plan (512 MB).** The backend fits easily. The ml-service imports pandas, numpy, LangGraph and
the OpenAI client; whether a Council run stays under 512 MB has not been measured on Render. Phase 2a measured the
idle container locally (see `.work/REPORT_phase2a.md`, C2) but an idle number does not cover a run. If Render shows
"out of memory" or restarts the service during a Council run, move `fillscore-ml` to the Starter plan (paid) — that
is a money decision for Deepanshu, not a code change.

**Sleeping.** Free services sleep after 15 idle minutes and wake in about a minute. The 750 free instance hours a month
are shared by both services; do not keep both awake with an uptime pinger.

**Image tagging.** The backend image sets `FILLSCORE_DEPLOY=1`; the backend then refuses to boot unless
`NODE_ENV=production`. On the ml-service, `render.yaml` sets `FILLSCORE_DEPLOY=1`, which makes the local grounding
debug sink (`FILLSCORE_GROUNDING_DEBUG`) refuse to turn on.

## 2. Environment variables by service

### fillscore-api (backend) — `render.yaml`

| Name | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` (set in `render.yaml`) |
| `TRUST_PROXY_HOPS` | yes | `2` (Vercel + Render proxies; set in `render.yaml`) |
| `PORT` | yes | injected by Render |
| `BACKEND_URL` | yes in production | the **Vercel** site URL (OAuth callbacks go through the `/api` rewrite) |
| `FRONTEND_URL` | yes in production | the Vercel site URL |
| `ALLOWED_ORIGINS` | yes | the Vercel site URL; comma-separated if several; no trailing slash |
| `MONGODB_URI` | yes | Atlas connection string |
| `JWT_ACCESS_SECRET` | yes | **must equal the ml-service value** |
| `JWT_REFRESH_SECRET` | yes | backend only |
| `ENCRYPTION_KEY` | yes | 64 hex characters (AES-256-GCM key for stored exchange secrets); startup fails otherwise |
| `BINANCE_API_KEY`, `BINANCE_API_SECRET` | yes | the app's own read-only key for public market data (not a user's key) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google OAuth app |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | yes | GitHub OAuth app |
| `RESEND_API_KEY` | optional | transactional email; without it no email is sent |
| `EMAIL_FROM` | optional | sender address for that email |

### fillscore-ml (ml-service) — `render.yaml`

| Name | Required | Notes |
|---|---|---|
| `PORT` | yes | `8000` (set in `render.yaml`) |
| `JWT_ACCESS_SECRET` | yes | **must equal the backend value**; the service refuses to start without it |
| `MONGODB_URI` | yes | same Atlas cluster as the backend (`/ready` pings it) |
| `ALLOWED_ORIGINS` | yes | the Vercel site URL (the browser calls this service directly) |
| `GROQ_API_KEY` | yes | Council models (free tier); `/ready` reports it |
| `GEMINI_API_KEY` | optional | adds the Gemini free-tier fallbacks |
| `FILLSCORE_DEPLOY` | yes | `1` (set in `render.yaml`) |
| `COUNCIL_DAILY_RUN_CAP` | optional | default 8 (set in `render.yaml`) |
| `COUNCIL_ACCOUNT_RUNS_PER_HOUR` | optional | default 3 |
| `COUNCIL_ENABLED`, `COUNCIL_DISABLED_MESSAGE` | optional | kill switch and its message |
| `MONGO_DB_NAME` | optional | default `fillscore` |

Never set `FILLSCORE_GROUNDING_DEBUG` on a deployed service (it is refused anyway).

### Vercel (frontend), Production environment

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` (relative, so the browser stays on the Vercel origin) |
| `BACKEND_PROXY_URL` | `https://<fillscore-api>.onrender.com` — no trailing slash, no `/api`. Server-side only (read by `next.config.mjs`). |
| `NEXT_PUBLIC_ML_URL` | `https://<fillscore-ml>.onrender.com` — no trailing slash |
| `NEXT_PUBLIC_SITE_URL` | the Vercel site URL (share links) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | optional, shown on the legal pages |

`NEXT_PUBLIC_*` values are compiled into the browser bundle: they are public by design and must never hold a secret.
After changing any of them, redeploy so the build picks them up.

### Values that must match across services

| What | Where it must be identical |
|---|---|
| `JWT_ACCESS_SECRET` | backend and ml-service (the ml-service verifies the backend's HS256 access tokens) |
| `MONGODB_URI` | backend and ml-service point at the same cluster and database |
| the Vercel site URL | backend `BACKEND_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`; ml-service `ALLOWED_ORIGINS`; Vercel `NEXT_PUBLIC_SITE_URL`; the OAuth callback URLs |
| the Render URLs | Vercel `BACKEND_PROXY_URL` (backend) and `NEXT_PUBLIC_ML_URL` (ml-service) |

## 3. CORS and how the browser reaches each service

- **Backend:** the browser calls `/api/...` on the Vercel origin and Vercel rewrites it to `BACKEND_PROXY_URL`
  (`frontend/next.config.mjs`). The refresh cookie therefore stays first-party. The backend still checks
  `ALLOWED_ORIGINS` (CORS with credentials, and the CSRF trusted-origin check), so it must hold the Vercel URL.
- **ml-service (Council stream):** the browser calls `NEXT_PUBLIC_ML_URL` directly: `GET /health` to wake it, then
  `POST /ml/agents/council/stream` with `Authorization: Bearer <access token>` (no cookie). The stream is read with
  `fetch` and a `ReadableStream`. CORS on the ml-service allows only `ALLOWED_ORIGINS`, methods GET/POST/OPTIONS and
  headers `Authorization`, `Content-Type`.
- A preflight from any other origin gets no `Access-Control-Allow-Origin` header. `scripts/smoke_prod.sh` checks both
  the allowed and a refused origin on both services.

## 4. Atlas network access

Render's free plan has no fixed outbound IP, so Atlas cannot be pinned to one address. Use Atlas → Network Access →
`0.0.0.0/0`, a long random database password, and a database user limited to the `fillscore` database.

## 5. OAuth callback URLs

Because the API is reached through the Vercel origin, both callbacks use the Vercel domain:
`https://<vercel-site>/api/auth/google/callback` and `https://<vercel-site>/api/auth/github/callback`.

## 6. Verify

```bash
scripts/smoke_prod.sh https://<fillscore-api>.onrender.com https://<fillscore-ml>.onrender.com https://<vercel-site>
```

It prints one PASS/FAIL line per check (health, ready, version on both services; CORS allowed and refused on both;
Binance reachability from the backend host) and never prints a secret. The first call after a sleep can take a
minute; the script waits for it.

## 7. Building the images locally

```bash
docker build -t fillscore-api ./backend
docker build -t fillscore-ml ./ml-service
```

See `docs/FIRST_REAL_USER.md` for the full order of dashboard steps.
