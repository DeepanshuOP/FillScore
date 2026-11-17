# ADR-0016: Personal API keys for the read-only MCP server

Date: 2026-11-18. Status: accepted. Approved by Deepanshu on 2026-11-18 (item 15) with the constraints below.

## Context

The MCP server (M5) needed an access token, which expires after 15 minutes. A real account could not use it for longer than that. A long-lived credential is a new kind of secret, so it needed approval and fixed limits.

## Decision

A personal API key, `fsk_` + 8 hex characters (visible prefix) + `_` + 43 base64url characters (256 random bits).

- **Read-only scope, the only scope.** `GET` and `HEAD` only, and only on the six routes the MCP tools call (`/api/audit/v2`, `orders-summary`, `exceptions`, `orders/:id/replay`, `rankings`, `venue-comparison`). Any other method is refused with `api_key_read_only`; any other path with `api_key_scope`. This is narrower than "every GET" on purpose (least privilege). A new tool needs a new line in `KEY_READ_PATHS` and a test.
- **Shown once; stored as a hash.** Only SHA-256 of the key is stored, with the 12-character prefix for display. A 256-bit random secret needs no salt and no slow hash. The key is returned by the create call only, with `Cache-Control: no-store`. Listing never returns the key or its hash. The account export lists name, prefix and dates only.
- **Expiry.** 90 days by default; 1 to 365 days can be chosen. No renewal: create a new key.
- **Revocable.** `DELETE /api/keys/:id` works at once. Another user's key looks like no key (404).
- **At most 5 active keys per user** (not revoked, not expired). The count is checked before and after the insert, so two requests at one moment cannot make a sixth.
- **Rate limit per key:** 60 requests a minute (in memory, one API instance), with `Retry-After`. Key management has its own limit of 30 requests per 15 minutes per IP. The existing `/api/audit` IP limit still applies.
- **`lastUsedAt`,** written at most once a minute per key.
- **Account isolation.** The account is the key owner's. A `userId` parameter naming another real account is refused (403), as for a login token. A key never reaches the routes that read a login token (`requireAuth`): it cannot create, list or revoke keys, read the account export, or touch exchange connections.
- **Creating a key asks for re-authentication,** like deleting an account: the password for password accounts, a login in the last 5 minutes for OAuth-only accounts. A stolen 15-minute access token therefore cannot create a 90-day credential. (This goes beyond the approved list; it costs the user one password entry.)
- **A password reset revokes the account's active keys** (reviewer finding, 2026-11-18): a key made by someone who held the account must not outlive a reset made because the account was lost. There is no "revoke all" button yet; each key has its own Revoke.
- A missing or wrong password on creation answers 403 `reauth_required`, not 401: the web client reads a 401 as an expired login token and would retry, running the password check twice. The list returns the 50 newest keys.
- **Account deletion removes the account's keys** (a test lists every collection after deletion).
- One answer for an unknown, malformed, revoked or expired key (`invalid_api_key`), so the response does not say which.

## Consequences

- A leaked key lets its finder read that account's stored measurements of past executions until it expires or is revoked. It cannot change anything, see exchange keys, or read other accounts. The measurements contain no advice and no exchange secrets.
- The per-key limiter is per process. With several API instances the limit would multiply; today there is one.
- Keys are not tied to an IP or a client. If that is wanted, it is a later change.

## Tests

`backend/src/routes/__tests__/apiKeys.test.ts` (creation, re-authentication, hash-only storage, expiry bounds, the limit of 5, listing, revocation, cross-user reads and revocation, scope, read-only methods, unknown/expired/revoked keys, `lastUsedAt`, per-key limit), `accountRights.test.ts` (deletion leaves no key), `frontend/app/lib/apiKeys.test.ts`, `frontend/e2e/api-keys.spec.ts`.
