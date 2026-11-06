# Observability

Everything here is a **no-op unless its env var is set**. Nothing breaks without them, CI needs no secrets.

## What is sent where

| Signal | Where | Enabled by | Sent |
|---|---|---|---|
| Errors, backend (Node) | Sentry | `SENTRY_DSN` | exception, stack, route, `request_id` and `account_hash` tags |
| Errors, frontend (Next, browser) | Sentry | `NEXT_PUBLIC_SENTRY_DSN` | exception, stack, route |
| Errors, ml-service (FastAPI) | Sentry | `SENTRY_DSN` | exception, stack, route, `request_id` and `account_hash` tags |
| LLM calls (one OTel trace per Council run, one span per router HTTP attempt) | Langfuse via OTLP/HTTP | `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` + `LANGFUSE_HOST` (all three) | model, provider, role, latency, tokens in/out, attempt, paced wait, outcome |
| Structured request logs | stdout (Render/Vercel logs) | always | `requestId`, method, path, status, ms, 12-hex `account` hash |

Optional: `SENTRY_ENVIRONMENT` (defaults to `production` on Render, else `dev`).

## What is never sent

- Request bodies, query strings, cookies, `Authorization`, and any field whose name matches
  `key|secret|token|password|passphrase|passwd|uri|authorization|cookie|credential`
  (this covers exchange API key payloads). Connection strings and `Bearer`/`Basic` values inside
  strings are replaced with `[Filtered]`. `sendDefaultPii` is off, `user` is dropped from every event.
  Scrubbers: `backend/src/observability/scrub.ts`, `frontend/lib/sentryScrub.ts`,
  `ml-service/observability/scrub.py` (each unit-tested).
- Emails and raw account ids: logs and tags carry only `sha256(accountId)[:12]`.
- Prompt and response **text is attached to a span only for demo accounts** (`demo-*`, from
  `VALID_DEMO_USERS`). For real users spans carry metadata only, never trade data, keys or text.
- No LLM-emitted number is ever recorded as a result; token counts and latencies come from the provider
  response and the local clock.

## Linking an error to its logs

Every response carries `x-request-id`. The same id is in the JSON log line, in the 500 response body
(`requestId`, backend) and as the Sentry tag `request_id`. Search the logs for it.
Each Council run stores `trace_id` on its `council_runs` doc: paste it into Langfuse to see the run's calls.

## Env var names

`SENTRY_DSN` (backend + ml-service), `NEXT_PUBLIC_SENTRY_DSN` (frontend, inlined at build time),
`SENTRY_ENVIRONMENT`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`.
