# Free hosting guide

How to run FillScore for **$0 a month** now that the Railway trial is over.
Written in plain steps. Nothing here needs code changes; the repo is already prepared
(`render.yaml`, the Vercel `/api` proxy, the cold-start handling in the Council panel).

Last researched: October 2026. Free tiers change often, so re-check the pricing pages
linked at the bottom before relying on any number here.

## 1. The plan in one picture

```
Browser ──▶ Vercel (frontend, free)
              │  /api/*  is forwarded (rewrite) ──▶ Render: fillscore-api  (backend, free, Frankfurt)
              │                                              │
Browser ──────┴─ Council stream goes direct ───────▶ Render: fillscore-ml   (ml-service, free, Frankfurt)
                                                             │
                                            both talk to ──▶ MongoDB Atlas M0 (database, free)
```

| Piece | Where | Cost | Catch |
|---|---|---|---|
| Frontend | Vercel Hobby (already live at `https://fill-score-kappa.vercel.app`) | $0 | Non-commercial use only on Hobby |
| Backend API | Render free web service, Frankfurt | $0 | Sleeps after 15 idle minutes, ~1 minute to wake |
| ml-service (Council) | Render free web service, Frankfurt | $0 | Same sleep; 512 MB RAM must be proven (see 5) |
| Database | MongoDB Atlas M0 (already in use) | $0 | 512 MB, ~100 ops/sec, 1 GB/week traffic |
| LLM | Groq free tier (already in use) | $0 | 100K tokens/day on the 70B model |

Why Frankfurt: the roadmap (R6-B0.3) worries that Binance blocks some US datacenter IPs
(HTTP 451). A European region is the safer bet. This is **not verified from Render yet**; step 6 is the check.

## 2. Why these choices (the research)

| Option | Verdict | Reason |
|---|---|---|
| **Render free** | **Chosen** | Real free web services, no card needed, deploys straight from `render.yaml`. Sleeps when idle, which is fine here because the Council already shows a "waking up" message. |
| Railway | Dropped | Trial ended; the free plan is now a small monthly credit that pauses services when spent. |
| Fly.io | Dropped | No free tier in 2026, only a short trial. |
| Koyeb | Backup | Free instance does not sleep (512 MB), but allows only one free web service. Could host just the backend if Render's hours ever run short. |
| Oracle Cloud Always Free | Upgrade path | Best specs and never sleeps, but: Oracle halved the free ARM allowance in June 2026 (now 2 OCPU / 12 GB), capacity errors are common, a card is required, and idle instances can be reclaimed. Kept as plan B; `docs/PROD_DEPLOY.md` and `docker-compose.prod.yml` still work for it. |
| Hugging Face Spaces | Dropped | Docker Spaces need a paid plan since July 2026. |
| Atlas M0 | Keep | Permanent free tier. Limits: 512 MB storage, 100 connections, 100 ops/sec, 1 GB/week in and out. |

**The 750-hour rule.** Render gives each workspace 750 free instance hours a month, shared by
all free services. A sleeping service uses none. One service awake all month is ~720 hours,
so **do not keep both awake 24/7** (do not add an uptime pinger for both). Left alone they
sleep when idle and the budget is never reached. If the hours do run out, Render suspends
every free service until the 1st of the month.

**Why the Vercel proxy.** The backend sets a login cookie. If the API lived on a different
domain from the site, browsers that block third-party cookies (Safari by default, Chrome
increasingly) would silently drop it and users would be logged out on every refresh. The
`/api` rewrite in `frontend/next.config.mjs` makes the browser think the API is on the same
domain, so the cookie is first-party. It also removes the CORS round trip.

## 3. What you do, in order

You need accounts on GitHub (have), Vercel (have), MongoDB Atlas (have), Groq (have) and
Render (new, free, sign in with GitHub, no card).

### Step A. Create the two services on Render

1. Go to render.com → **New** → **Blueprint** → pick the `DeepanshuOP/FillScore` repo, branch `main`.
2. Render reads `render.yaml` and proposes `fillscore-api` and `fillscore-ml`, both on the **Free** plan in **Frankfurt**.
3. It asks for every secret marked `sync: false`. Paste values from your own password manager. **Do not paste them anywhere else.**
   - `JWT_ACCESS_SECRET` must be **identical** on both services.
   - `BACKEND_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS` are all `https://fill-score-kappa.vercel.app` (no trailing slash).
   - `ALLOWED_ORIGINS` on `fillscore-ml` is the same Vercel URL.
4. Click **Apply**. The first build takes several minutes (the ml-service image is large).
5. When both show **Live**, open `https://<fillscore-api>.onrender.com/health` and `https://<fillscore-ml>.onrender.com/health`. Each should answer `{"status":"ok",...}` (the first call after sleep takes about a minute).

### Step B. Let the database accept Render

Render's free tier has no fixed IP, so Atlas cannot be locked to one address.
Atlas → **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
The database is still protected by its username and password, so use a long random password,
and a database user with access to the `fillscore` database only.

### Step C. Point Vercel at Render

Vercel project → **Settings** → **Environment Variables** (Production), then **Redeploy**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `/api` |
| `BACKEND_PROXY_URL` | `https://<fillscore-api>.onrender.com` (no trailing slash, no `/api`) |
| `NEXT_PUBLIC_ML_URL` | `https://<fillscore-ml>.onrender.com` |

Remove any old Railway URL.

### Step D. Update the OAuth apps

Because the API is reached through the Vercel domain, the callback URLs use **the Vercel domain**:

- Google Cloud Console → OAuth client → Authorized redirect URI: `https://fill-score-kappa.vercel.app/api/auth/google/callback`
- GitHub → OAuth App → Authorization callback URL: `https://fill-score-kappa.vercel.app/api/auth/github/callback`

### Step E. Check it works

1. Open the site, sign up with email, log in, refresh the page (you should stay logged in).
2. Open the demo dashboard (`/dashboard?userId=demo-disciplined`) and press **Run analysis**. If the Council was asleep you will see the "waking up" note, then results.
3. Sign in with Google and GitHub once each.

## 4. Optional: keep the backend awake for demos

Only if you are about to show the site to someone. Use a free uptime monitor (for example UptimeRobot)
to call `https://<fillscore-api>.onrender.com/health` every 10 minutes, and **turn it off afterwards**.
Never ping both services all month (see the 750-hour rule).

## 5. Things I could not verify from here

Be honest with yourself about these until you have seen them work:

1. **ml-service on 512 MB RAM.** It imports pandas, LangGraph and friends. If Render shows
   "out of memory" or the service restarts during a Council run, move the ml-service to
   Oracle (`docs/PROD_DEPLOY.md`) or to a $7/month Render instance. The backend alone fits easily.
2. **Binance from Frankfurt on Render.** Roadmap R6-B0.3. From the Render shell of `fillscore-api`
   run a request to `https://api.binance.com/api/v3/time`. A 200 is good; 451 means Binance blocks that
   address range and screenshot ingestion (roadmap R6-C1) becomes the main onboarding path.
3. **Vercel proxy and slow wake-ups.** The first request after sleep takes ~1 minute. Browsers wait
   for it, but if Vercel gives up first the user sees an error once and the retry works. The
   dashboard already retries the Council; the other pages simply need a refresh.
4. **Hobby terms.** Vercel Hobby and Render free are for non-commercial use. A paid product needs paid plans.

## 6. Sources

- Render free tier: <https://render.com/docs/free>
- Render platforms with a real free tier (2026): <https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026>
- Koyeb pricing: <https://www.koyeb.com/pricing>
- Oracle free ARM allowance cut: <https://braindetox.kr/en/posts/oracle_always_free_tier_reduced_2026.html>
- MongoDB Atlas free limits: <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>
- Vercel rewrites to external origins: <https://vercel.com/docs/rewrites>
