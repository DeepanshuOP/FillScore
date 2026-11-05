# First real user: Deepanshu on the deployed stack

A runbook for the first real-user test: deploy, connect a **read-only** Binance key, sync, audit, look at every page,
run the Council once, and optionally delete the account. Service and variable details are in `docs/DEPLOY.md`.
This page holds variable **names** only. Type values only into the Render and Vercel dashboards.

## 1. Dashboard steps, in order

1. **Render: create both services from the Blueprint.** render.com → New → Blueprint → repo `DeepanshuOP/FillScore`,
   branch `main`. Render reads `render.yaml` and proposes `fillscore-api` and `fillscore-ml`, both Free and Frankfurt.
   If `fillscore-api` already exists, use Blueprint → Sync, which adds `fillscore-ml` next to it.
2. **Render: fill the `sync: false` variables** (full table in `docs/DEPLOY.md` §2).
   - `fillscore-api`: `BACKEND_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS` (all three = the Vercel site URL, no trailing
     slash), `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (64 hex chars),
     `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
     `GITHUB_CLIENT_SECRET`, and optionally `RESEND_API_KEY`, `EMAIL_FROM`.
   - `fillscore-ml`: `ALLOWED_ORIGINS` (the Vercel site URL), `JWT_ACCESS_SECRET` (**the same value as the backend**),
     `MONGODB_URI` (the same cluster), `GROQ_API_KEY`, and optionally `GEMINI_API_KEY`.
     `PORT=8000`, `FILLSCORE_DEPLOY=1` and `COUNCIL_DAILY_RUN_CAP=8` come from `render.yaml`.
3. **Render: Apply** and wait until both services show **Live**. The ml-service image is large, so the first build takes
   several minutes.
4. **Atlas: Network Access.** Render's free plan has no fixed outbound IP, so allow `0.0.0.0/0`. Use a long random
   password and a database user limited to `fillscore`.
5. **Vercel: Settings → Environment Variables (Production).** Set `NEXT_PUBLIC_API_URL=/api`,
   `BACKEND_PROXY_URL=https://<fillscore-api>.onrender.com`, `NEXT_PUBLIC_ML_URL=https://<fillscore-ml>.onrender.com`
   and `NEXT_PUBLIC_SITE_URL=<Vercel site URL>`. Remove any old Railway URL. Then **Redeploy**, because
   `NEXT_PUBLIC_*` values are baked in at build time.
6. **OAuth apps.** Set the Google redirect URI to `<Vercel site URL>/api/auth/google/callback` and the GitHub
   callback to `<Vercel site URL>/api/auth/github/callback`.

## 2. Smoke test

From `~/FillScore`:

```bash
scripts/smoke_prod.sh https://<fillscore-api>.onrender.com https://<fillscore-ml>.onrender.com <Vercel site URL>
```

Expected: every line PASS and `N passed, 0 failed`. A sleeping service is woken first; the script waits up to 90 s.

| FAIL line | Meaning | What to do |
|---|---|---|
| `backend /ready` or `ml /ready` with HTTP 503 | Mongo not reachable (or, on ml, `GROQ_API_KEY` missing) | check `MONGODB_URI`, the Atlas network access, and `GROQ_API_KEY` |
| `... CORS allows frontend origin` | `ALLOWED_ORIGINS` doesn't exactly match the Vercel URL | fix it (scheme, no trailing slash) and redeploy that service |
| `... CORS refuses https://evil.example` | the allow-list is too wide | `ALLOWED_ORIGINS` must hold only the site URL |
| `backend reaches Binance` with `geo_blocked, HTTP 451` | Binance blocks Render Frankfurt's address range | stop: Binance sync can't work from this host. Report it; it's a hosting decision |
| `backend reaches Binance` with `rate_limited` or `error` | transient | re-run after a minute (the probe result is cached for 60 s) |

## 3. Create a read-only Binance API key

On binance.com: Profile → **API Management** → Create API → **System generated** (HMAC). Name it `fillscore-readonly`.

- Leave **Enable Reading** on. That is the only permission FillScore needs.
- Keep **Enable Spot & Margin Trading**, **Enable Margin Loan, Repay & Transfer**, **Enable Withdrawals**,
  **Enable Futures**, **Permits Universal Transfer** and **Enable Symbol Whitelist** **off**.
- The backend checks the key's own restrictions (`GET /sapi/v1/account/apiRestrictions`) and rejects any key with a
  permission other than reading (`key_not_read_only`). The only flags it accepts are `enableReading`,
  `enableFixReadOnly` and `ipRestrict`. If the key is rejected, the permissions above are the place to look.

**IP restriction, honestly.** Binance lets you restrict a key to trusted IPs, and some permissions require it.
Render's free plan has **no fixed outbound IP**: requests leave from a shared, changing pool, so you can't list one
address. The choices are:

1. **Unrestricted, read-only (what this test uses).** Binance shows a warning, and a read-only key may be valid for
   a limited time without an IP list (check the note on the key page; recreate it when it expires). The exposure if
   it leaked: someone could *read* your balances and trade history. They could not trade or withdraw. FillScore
   stores the secret AES-256-GCM encrypted and never returns or logs it.
2. **Restricted to Render's outbound ranges.** Render publishes outbound IP ranges per region in the service's
   *Connect → Outbound* panel. Listing those ranges ties the key to Render Frankfurt, but they are shared with other
   Render customers, so it narrows exposure without removing it.
3. **A fixed IP.** This needs a paid plan or a static egress add-on, which is a money decision.

Whichever you choose, delete the key from Binance after the test if you won't keep using the deployment.

## 4. The walkthrough

| Step | Do | Good looks like | Failure signatures |
|---|---|---|---|
| 1 | Open the Vercel site, **Sign up** with email (or Google/GitHub), verify the email if asked, log in, refresh the page | You stay logged in after the refresh | logged out on refresh: cookie or proxy problem (`BACKEND_PROXY_URL`, `NEXT_PUBLIC_API_URL=/api`) |
| 2 | `/onboarding` → Binance → paste the key and secret → Connect | "Connected"; the key is accepted | `key_not_read_only` (a permission besides reading is on); `invalid_key` (copy error); a network error (Binance unreachable: see smoke) |
| 3 | **Sync** | The trade count is > 0 for an account that traded | 0 trades on an account that traded: check the symbols and date range; a 451 in the sync error means geo-blocked |
| 4 | **Run the audit** (`/dashboard`) | Score and grade shown; attribution and trend render | an empty dashboard after the audit; a 429 means the audit-run limit (10 per 15 min) |
| 5 | `/analytics` and `/trades` | Charts render; every trade row has a fill score; fees in USD | rows without a fill score (`fillScore` missing on real trades); fee columns blank or `$0` on taker trades (`feeUsd` not set: USD fee math must use `feeUsd`, never the native `fee`) |
| 6 | Coach panel on the dashboard | Past-tense findings about your own fills | any advice or prediction wording ("you should", "could save") is a bug: screenshot it |
| 7 | **PDF report** and **CSV export** (`/trades` → export) | The PDF downloads and opens; the CSV opens with one row per trade, and `dataSource` is `real-user` | a 401 on download (download token); an empty CSV |
| 8 | **Run the Council once** on the dashboard | It may first show "waking up" for about a minute, then four specialists, the debate and the verdict. The run is **not degraded**: it has a rating, the panel shows no degraded banner, and findings/observations render | "degraded" or "no model returned a valid answer" (Groq free limits: wait and retry once; don't loop); a CORS error in the browser console (ml-service `ALLOWED_ORIGINS`); a 401 from the stream (`JWT_ACCESS_SECRET` differs between the services) |

The Council allows 8 runs a day across the deployment and 3 per account per hour.

## 5. Clean up (optional)

- **Delete the account:** `/settings` → Delete account. Password accounts confirm with the password; OAuth-only
  accounts need a login from the last 5 minutes. This removes the user, trades, audits, history, exchange
  connections (the encrypted key) and tokens.
- **Not removed by that:** the ml-service's `council_runs` for the account (verdicts and packet hashes, no keys or
  trades). Removing them needs an ml-service endpoint that doesn't exist yet. Ask before deleting them by hand
  in Atlas.
- **Delete the API key on Binance** (API Management → Delete) if you won't keep using it.
