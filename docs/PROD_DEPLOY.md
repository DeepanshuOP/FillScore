# Production deploy — Oracle Cloud VM (R6-B0.1 / R6-B0.2)

Repo-side prep for moving `backend` and `ml-service` off Railway onto a
self-hosted Oracle Cloud Always Free VM (Ampere A1, ARM64, `eu-frankfurt-1`),
behind Caddy for HTTPS. Frontend stays on Vercel. See `ROADMAP.md` §3
(R6-B0.1–R6-B0.4) for the full context and DoD.

Never commit real values for anything below — this is a checklist of
**names**, not a place to paste secrets.

## 1. VM prerequisites (external, before first `docker compose up`)

- Docker + Docker Compose plugin installed on the VM.
- OCI Security List (or VM firewall) allows inbound **80** and **443**
  (and 22 for SSH, already required for access). This is the actual security
  boundary for `backend`/`ml-service` staying private — `docker-compose.prod
  .yml` binds them to `127.0.0.1` only, so they aren't reachable even if the
  firewall were misconfigured, but the firewall is still the primary control.
- DNS A records for `api.fillscore.YOURDOMAIN.tld` and
  `ml.fillscore.YOURDOMAIN.tld` point at the VM's public IP (required before
  Caddy can issue certs — it validates ownership over port 80).
- **MongoDB Atlas → Network Access → IP Access List**: add the VM's public
  IP. Easy to forget — Railway's IP is not the VM's IP, so audits will fail
  silently with connection timeouts until this is added.

## 2. `backend/.env` on the VM (create by hand, never commit)

| Var | Value on prod |
|---|---|
| `NODE_ENV` | `production` |
| `BACKEND_URL` | `https://api.fillscore.YOURDOMAIN.tld` |
| `FRONTEND_URL` | the Vercel production URL |
| `ALLOWED_ORIGINS` | same as `FRONTEND_URL` (comma-separated if more than one) |
| `MONGODB_URI` | Atlas connection string |
| `JWT_ACCESS_SECRET` | must be **identical** to ml-service's value below |
| `JWT_REFRESH_SECRET` | — |
| `ENCRYPTION_KEY` | — |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — |
| `RESEND_API_KEY` / `EMAIL_FROM` | if email is wired up |

`TRUST_PROXY` does not need to be set explicitly — `NODE_ENV=production`
already sets `trust proxy=1`, which is correct with Caddy as the one proxy
hop in front (see the comment at `backend/src/index.ts` near the top).

## 3. `ml-service/.env` on the VM (create by hand, never commit)

| Var | Value on prod |
|---|---|
| `ALLOWED_ORIGINS` | same Vercel production URL — **set independently**; `main.py` parses its own `ALLOWED_ORIGINS` via a separate `os.environ.get`, it does not share backend's parser |
| `JWT_ACCESS_SECRET` | **identical** value to backend's. `main.py`'s fallback read of `../backend/.env` (used for local dev, where both services share a filesystem) does not work once each service is its own container — this must be set directly here |
| `MONGODB_URI` | same Atlas connection string as backend |
| `GROQ_API_KEY` | required — startup-fatal if missing, and now also checked by `/ready` |
| `OPENROUTER_API_KEY` | only needed if `SYNTHESIS_PROVIDER` is ever switched off `"groq"` |

## 4. Vercel env vars (frontend project settings, not this repo)

| Var | Value on prod |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.fillscore.YOURDOMAIN.tld/api` — note the required `/api` suffix, matching the existing local fallback (`http://localhost:3001/api`) |
| `NEXT_PUBLIC_ML_URL` | `https://ml.fillscore.YOURDOMAIN.tld` — no suffix. Corrects the previous placeholder that was wrongly pointed at the backend. |

## 5. External OAuth redirect URIs (console changes, not code)

- Google Cloud Console → OAuth Client → Authorized redirect URIs → add
  `https://api.fillscore.YOURDOMAIN.tld/api/auth/google/callback`
- GitHub OAuth App → Authorization callback URL →
  `https://api.fillscore.YOURDOMAIN.tld/api/auth/github/callback`

Remove the old Railway callback URLs once the new ones are verified working.

## 6. Deploy

```powershell
# on the VM, via SSH
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`docker-compose.prod.yml` is an override, not a standalone file — it must
always be applied together with the base `docker-compose.yml`. It rebinds
`backend`/`ml-service` to `127.0.0.1` (using the compose-spec `!override`
merge tag — a plain port list without it gets *appended to*, not replaced,
by Compose's default merge behavior) and adds `caddy`, which reads
`deploy/Caddyfile` and is the only service publishing to `0.0.0.0`.

## 7. Verify

```powershell
curl https://api.fillscore.YOURDOMAIN.tld/health
curl https://api.fillscore.YOURDOMAIN.tld/ready
curl https://api.fillscore.YOURDOMAIN.tld/version
curl https://ml.fillscore.YOURDOMAIN.tld/health
curl https://ml.fillscore.YOURDOMAIN.tld/ready
curl https://ml.fillscore.YOURDOMAIN.tld/version
```

`/ready` on both services returns 503 until their dependencies are actually
reachable (backend: Mongo connected; ml-service: Mongo ping succeeds and
`GROQ_API_KEY` is set) — a 503 here means a real env var or network problem,
not a bug in the endpoint.

## 8. Cookie config — no action needed

`backend/src/utils/cookieConfig.ts` already sets `SameSite=None; Secure` in
production for the refresh-token cookie, because the frontend (Vercel) and
API are cross-site. This is host-agnostic and needs no change for the new
domain.

## Non-goals of this doc

- ml-service Docker image slimming (841MB → smaller) is R6-B0.2, not covered
  here.
- Actual VM provisioning, DNS registration, and the OAuth console changes
  above are external actions for whoever is running the deploy — this doc
  only enumerates what they are, it doesn't perform them.
