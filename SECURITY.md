# Security Policy

FillScore handles read-only exchange API keys and trade history, so security reports are welcome and
taken seriously.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private reporting instead:
open the repository's **Security** tab and choose **Report a vulnerability**. Include what you found,
how to reproduce it, and what an attacker could do with it.

We will acknowledge a report as soon as we can, keep you updated while we investigate, and credit you
in the fix unless you prefer not to be named. Please give us a reasonable chance to ship a fix before
you disclose details publicly, and do not access, change, or delete data that is not yours while
testing.

## What is in scope

The backend (`backend/`), the ml-service (`ml-service/`), the frontend (`frontend/`), and the
deployment files in this repository. Findings in third-party services we depend on belong with those
providers.

## Threat model

### What we protect, and how

| Asset | Threat | What is implemented |
|---|---|---|
| Exchange API keys, secrets, OKX passphrases | Database leak, over-privileged keys | Stored only as AES-256-GCM payloads. A key is accepted only if the exchange itself reports it is read-only (Binance `apiRestrictions`, Bybit `query-api`, OKX `account/config`); keys with trading or withdrawal rights are refused and never stored. |
| Sessions | Token theft, replay, CSRF | 15 minute access tokens; refresh tokens in HTTP-only cookies, stored as SHA-256 hashes, rotated on use with family revocation on reuse; `Origin` check on refresh, logout and OAuth exchange. |
| OAuth sign-in | Token leakage through URLs, account takeover | No token is ever placed in a URL; the callback hands over a 30 second single-use code. Providers must report a verified email, and an unverified local password is discarded when a provider claims the same address. |
| Per-user data | Cross-tenant reads | Identity comes only from the JWT or a personal API key, never from a request parameter. The sole request parameter that selects an account is one of the three public `demo-*` slugs. Every query is scoped by `accountId`. |
| Personal API keys (MCP server) | Leaked or over-broad key | Read-only: GET and HEAD on six routes only, SHA-256 hash stored (the key is shown once), expiring (90 days by default), revocable, 5 per user, rate-limited per key, revoked on a password reset and deleted with the account; creating one asks for the password again; a key never reaches the routes that read a login token (ADR-0016). |
| Evidence packs | A pack edited after signing | Ed25519 signature over a manifest of every file with its SHA-256; checked in the browser (nothing uploaded) or offline; "valid" only against a key the user trusts. |
| Account data | Data left behind after erasure | `DELETE /api/account/` removes the account's trades, audits, orders, measurements, v2 scores, review states, commission snapshots, keys and sessions, and asks the ml-service to remove its Council runs and traces. `GET /api/account/export` returns the same data (hashes of keys never leave the server). |
| Error and log content | Secrets in logs | A body that does not parse is a 400, and errors are logged by name and code only, never as objects that may hold request data; Sentry scrubs bodies, headers, cookies and query strings on all three tiers. |
| File downloads | Bearer tokens cannot be sent by `window.open` | One-minute, single-purpose link tokens signed with a key derived from (not equal to) the access secret. |
| Council output | Invented numbers, leaked errors | Language models receive aggregate, de-identified packet statistics (no identifiers, keys or notes). Numbers reach users only via a deterministic renderer; stray numerals are regenerated, then redacted; claimed effects are recomputed by replaying the user's trades. Errors reach the browser only as typed codes with fixed messages. |
| Service availability and cost | Abuse of the LLM allowance | Council run budget (per account and per day), plus rate limits on every route group. |
| Input | Injection, runaway queries | zod validation on audit, trade, export, note and connect inputs; bounded page sizes and look-back windows; no user text is ever turned into a regular expression or a database operator. |
| Provenance | Synthetic data passed off as real | `dataSource` is immutable at the schema level; audit history rows cannot be edited. |

### Known limits

These are real gaps, listed so nobody has to guess.

- Rate limits, the failed-login limit per account, the API-key limit, the CSV-check budget and the Council run budget are held in memory, so they are per instance and reset on a deploy. The per-IP limits rest on `X-Forwarded-For` behind two proxies; a client that reaches the API host directly can vary the address, which is why login has a limit per account as well (10 failures in 15 minutes; it also lets someone lock a login for 15 minutes on purpose).
- There is no `ENCRYPTION_KEY` rotation tooling yet; rotating the key means re-connecting exchanges. The AES-GCM payloads carry no additional authenticated data, so someone with write access to the database could move one account's encrypted key onto another account (changing that needs a migration).
- Registration says when an email already exists, and the login path for an unknown email takes a different time from a known one.
- `POST /api/onboarding/sync` has no cooldown beyond the per-account lock.
- Access to the API host by its own address, without the Vercel front, is possible; the Node runtime moved from 20 (end of life 2026-04-30) to 26, the Active LTS, on 2026-11-19 (nodejs/Release `schedule.json`; `docs/runbooks/DEPLOY.md` §4).
- Billing code exists behind `BILLING_ENABLED` (off); account deletion does not cancel a Stripe subscription, which must be added before billing is turned on.
- There is no separate "reader" model that sanitises free text before it reaches a language model.
  Today the Council receives numeric packets only, and trade notes are never sent to it.
- Error tracking exists (Sentry on all three tiers, scrubbed; see `docs/OBSERVABILITY.md`), but there is no audit log of administrative actions.
- Bybit and OKX key checks follow each exchange's documented permission fields but have not yet been
  exercised against live keys in this repository.
- Dependabot alert 272 (high, 2026-11-17): `picomatch` up to 4.0.7, regular-expression denial of service through repeated extglobs (GHSA-fc5q-39xc-vjpf). Checked on 2026-11-18: GitHub withdrew the advisory on 2026-11-18 and closed the alert as fixed; it lists no patched version, so none exists to install. The package is in `frontend/package-lock.json` only through build and test tools (`@sentry/nextjs` build plugins, `vite`, `vitest`, `eslint`), and a search of the last local build's `.next/server` found no reference to it, so it is build-time only (not confirmed against the Vercel build itself). No override applied. If GitHub re-opens the advisory, check again.
- Production deploy gate: Render and Vercel can deploy a commit that failed CI (see `docs/runbooks/DEPLOY.md`). The runbook has the dashboard steps; until the Vercel gate is applied, this is an open gap.
- The git history contains credentials that were later moved to the environment. They have been
  rotated and no longer work.

## For people running their own instance

- Keep every secret in the environment. `.env` files are ignored by git; never commit one.
- Generate `ENCRYPTION_KEY` as 32 random bytes in hex, and `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
  as long random strings. `JWT_ACCESS_SECRET` must match between the backend and the ml-service.
- Run behind HTTPS (the compose files use Caddy), set `NODE_ENV=production`, and set `FRONTEND_URL`,
  `BACKEND_URL` and `ALLOWED_ORIGINS` explicitly. The backend refuses to start in production without
  the first two.
- Create exchange keys with read permission only, and restrict them to your server's IP where the
  exchange allows it.
- Restrict MongoDB Atlas network access to your servers.
