# Project log

A running record of what changed in FillScore, **why**, and how the pieces fit together,
so the reasoning is not lost. Newest entry first. Add an entry for every meaningful
change or decision. Facts about scoring and demo grades live in `CLAUDE.md` and `ROADMAP.md`; this
file is the "what happened and why" history.

## How the system works (short version)

- **Frontend** (`frontend/`, Next.js 16, Vercel). Browser calls a relative `/api`; Vercel forwards it to the
  backend (`next.config.mjs`, `BACKEND_PROXY_URL`). The Council panel talks to the ml-service directly.
- **Backend** (`backend/`, Express + Mongoose). Auth, onboarding, exchange sync, deterministic scoring, audits, PDF and CSV export.
- **ml-service** (`ml-service/`, FastAPI + LangGraph + Groq). The Agent Council. It may label and explain but never originates a number.
- **Database**: MongoDB Atlas, database `fillscore`.
- **Hosting**: Vercel (frontend) + Render free (backend, ml-service) + Atlas M0. See `docs/FREE_HOSTING.md`.
- **Rules that must not break**: audit the past only; LLMs never create numbers; `dataSource` is immutable; secrets come from env only. Details in `CLAUDE.md`.

## 2026-10-01 (later) - First live deploy: what broke and how it was fixed

The free hosting from the entry below went live on Render. Three things failed on the first run, in this order.

| Symptom | Cause | Fix |
|---|---|---|
| `/ready` showed `mongo: false`; backend log said `bad auth : authentication failed` | `MONGODB_URI` still held Atlas's template text (`<db_password>`) and had no database name | New letters-and-digits password for the Atlas user; URI in the form `mongodb+srv://USER:PASSWORD@HOST/fillscore?retryWrites=true&w=majority`, identical on both services |
| Council stopped right after "Liquidity Scout thinking" with "unexpected problem"; Render log said `NotFoundError` | Groq retired `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` in August 2026, so every call returned 404 | Models are now read from `GROQ_SPECIALIST_MODEL` and `GROQ_SYNTHESIS_MODEL`, default `openai/gpt-oss-120b` |
| (found while fixing the above) | The free plan now allows about 8,000 tokens a minute and 200,000 a day on that model, and the old retry waited only 1 to 5 seconds | Retry now waits as long as Groq asks (capped at 30 s, up to 4 retries). One adapter around the Groq client (`adapt_client_for_models`) asks gpt-oss for low reasoning effort, scales the answer budget up 1.8x so thinking does not use it all, and swaps any retired model name for the current one, so no agent file had to change |

Other changes in this entry:

- A missing or retired model is now its own error code, `MODEL_UNAVAILABLE`, with a message that says it is a configuration problem, so it is not mistaken for a generic failure next time.
- ml-service tests: 274 passing, with new tests for model selection, the client adapter, retry timing and the new error code. Frontend: 117 passing.

Not verified: a full live Council run on the new model. One run is about 11,600 tokens, so on the free plan expect roughly 17 runs a day, and a run that starts inside a busy minute may pause for a few seconds while it waits for the limit. `CLAUDE.md` still names the old Llama models; update it when convenient.

## 2026-10-01 — Free hosting, API proxy, UI fixes

### Decisions

| Decision | Why | Alternatives rejected |
|---|---|---|
| Host backend and ml-service on **Render free** (Frankfurt), keep Vercel and Atlas | Only option that is genuinely free, needs no card, and deploys from a checked-in `render.yaml`. Sleeping is acceptable because usage is bursty and the UI now explains the wake-up. | Railway (trial over), Fly.io (no free tier), Hugging Face (Docker Spaces now paid), Koyeb (one free service only, kept as backup), Oracle Always Free (capacity and card friction, allowance halved in June 2026; kept as upgrade path). |
| Route API calls through a **Vercel rewrite** (`/api` to the backend) | Keeps the refresh cookie first-party so Safari/Chrome third-party cookie blocking cannot log users out; removes CORS hop. | Cross-site cookies with `SameSite=None` (works today, fragile), custom domain (costs money). |
| Council stream is **not** proxied | Long-lived SSE through a rewrite risks buffering and timeouts. It authenticates with a Bearer token, so it does not need the cookie. | Proxying everything. |
| Add `TRUST_PROXY_HOPS` | With Vercel then Render in front, one trusted hop would make every visitor share one IP and hit the same rate limit. Set to 2 in `render.yaml`. Out-of-range values fall back safely, never "trust all". | Hard-coding 2. |
| Do not keep both Render services awake | They would use 1,440 hours against a shared 750-hour monthly budget and Render would suspend both. | Pinging both. |

### Changes

- `render.yaml`: Render Blueprint for `fillscore-api` and `fillscore-ml` (free plan, Frankfurt, secrets typed in the dashboard).
- `frontend/next.config.mjs`: `/api/:path*` rewrite when `BACKEND_PROXY_URL` is set.
- `frontend/app/lib/serverApiBase.ts`: the share page and OG image run on the server and cannot use a relative `/api`; they use the proxy target. Tested.
- `backend/src/utils/trustProxy.ts` and `app.ts`: hop count resolver (`TRUST_PROXY_HOPS`), tested.
- `frontend/app/utils/serviceWarmup.ts` and `AgentCouncil.tsx`: the Council panel pings the ml-service when it mounts, waits up to 90 s for a sleeping service and shows a "waking up" note instead of failing as "offline". Tested.
- `docs/FREE_HOSTING.md`: the full research, comparison, step-by-step setup and a list of what is still unverified.

### UI fixes (found with a scripted browser audit at 375, 768 and 1280 px)

Method: loaded every page at three widths and measured horizontal overflow, controls with no accessible name,
inputs without labels, heading structure, tap-target size and console errors. Authenticated pages were rendered against a
local stand-in API. No screenshots were taken.

| Page | Problem | Fix |
|---|---|---|
| Trade ledger | Page scrolled sideways by up to 490 px on phones and 250 px on tablets: fixed-width columns summed to 544 px (mobile) and 960 px (desktop). | Compact 7-column layout below 1024 px with flexible columns; full table from 1024 px with narrower, flexible columns. Row index hides on small screens. |
| Trade ledger | Pagination printed one button per page (19+ buttons in a row, overflowing). | `pageWindow()` shows first, last, current and neighbours with ellipses, wraps, has `aria-label` and `aria-current`. Tested. |
| Dashboard | Exchange comparison cards overflowed by 12 px on phones. | Auto-fit grid, minimum 220 px. |
| Login, signup, forgot and reset password | Inputs not linked to their labels, so screen readers and click-on-label did not work. | `htmlFor` and `id` pairs. |
| Auth, onboarding, dashboard, trades, share | No `<h1>` (or only `<h2>`). | Proper `<h1>` (visually hidden where the design has no title). |
| Navbar | Mobile menu button had no accessible name and a ~28 px tap target. | `aria-label`, `aria-expanded`, larger hit area. |
| Footer, "Forgot password?", legal contents list | Links ~15 px tall. | Padded to a comfortable tap size. |
| All app pages | Every page shared the default browser-tab title. | Per-route titles (`layout.tsx` metadata). |

### Verified

Backend 456 tests passing (50 files), frontend 116 tests passing (18 files), `tsc --noEmit` clean in both, `next build` succeeds. Re-audited the pages at 375, 768 and 1280 px after the fixes: no horizontal overflow on any page. The ml-service was not touched. Not verified: any real deploy on Render (needs the owner's accounts).

### Still open (not done in this entry)

Carried from the earlier review: duplicate-audit cleanup before the unique `Audit.accountId` index builds,
legal review of Terms and Privacy, `vwap5m` vs `vwap5min` mismatch, git-history credential purge, and live checks
of Bybit and OKX key validation. Hosting steps A to E in `docs/FREE_HOSTING.md` are for the owner to carry out in the Render, Vercel,
Atlas, Google and GitHub dashboards.
