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
| Per-user data | Cross-tenant reads | Identity comes only from the JWT. The sole request parameter that selects an account is a known `demo-*` slug. Every query is scoped by `accountId`. |
| File downloads | Bearer tokens cannot be sent by `window.open` | One-minute, single-purpose link tokens signed with a key derived from (not equal to) the access secret. |
| Council output | Invented numbers, leaked errors | Language models only receive aggregated numeric packets. Every cited number is checked against the packet and every claimed saving is recomputed deterministically. Errors reach the browser only as typed codes with fixed messages. |
| Service availability and cost | Abuse of the LLM allowance | Council run budget (per account and per day), plus rate limits on every route group. |
| Input | Injection, runaway queries | zod validation on audit, trade, export, note and connect inputs; bounded page sizes and look-back windows; no user text is ever turned into a regular expression or a database operator. |
| Provenance | Synthetic data passed off as real | `dataSource` is immutable at the schema level; audit history rows cannot be edited. |

### Known limits

These are real gaps, listed so nobody has to guess.

- Rate limits and the Council run budget are held in memory, so they are per instance.
- There is no `ENCRYPTION_KEY` rotation tooling yet; rotating the key means re-connecting exchanges.
- There is no separate "reader" model that sanitises free text before it reaches a language model.
  Today the Council receives numeric packets only, and trade notes are never sent to it.
- There is no error tracking or audit log of administrative actions.
- Bybit and OKX key checks follow each exchange's documented permission fields but have not yet been
  exercised against live keys in this repository.
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
