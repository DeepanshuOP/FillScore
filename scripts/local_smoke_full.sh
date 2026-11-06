#!/usr/bin/env bash
# Full local smoke (Phase 3a.2 H3): throwaway mongod -> seed (local only) -> backend + ml + frontend ->
# scripts/smoke_prod.sh against localhost -> teardown (trap). No secrets, no Atlas, no live LLM calls.
#
# Written permission (Deepanshu): seeding is allowed ONLY against a local MongoDB. This script refuses to run
# if MONGODB_URI is set in the environment to anything that is not mongodb://127.0.0.1... / mongodb://localhost...
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT_MONGO="${SMOKE_MONGO_PORT:-27019}"
LOG="$(mktemp -d /tmp/fs-smoke-logs-XXXXXX)"
DBPATH="$(mktemp -d /tmp/fs-smoke-mongo-XXXXXX)"
PIDS=()

is_local_mongo_uri() { [[ "${1:-}" =~ ^mongodb://([^@/]*@)?(127\.0\.0\.1|localhost)(:[0-9]+)?([/?]|$) ]]; }

if [[ -n "${MONGODB_URI:-}" ]] && ! is_local_mongo_uri "$MONGODB_URI"; then
  echo "REFUSING: MONGODB_URI is set and is not a local MongoDB. Unset it; this script seeds." >&2
  exit 2
fi
export MONGODB_URI="mongodb://127.0.0.1:${PORT_MONGO}/fillscore_smoke"
is_local_mongo_uri "$MONGODB_URI" || { echo "REFUSING: computed MONGODB_URI is not local." >&2; exit 2; }

set -m  # job control: every background job is its own process group, so the whole tree can be killed
cleanup() {
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill -- "-$pid" 2>/dev/null; done
  sleep 1
  for pid in "${PIDS[@]:-}"; do [[ -n "$pid" ]] && kill -9 -- "-$pid" 2>/dev/null; done
  rm -rf "$DBPATH"
  echo "teardown done (logs kept in $LOG)"
}
trap cleanup EXIT INT TERM

find_mongod() {
  if [[ -n "${E2E_MONGOD:-}" ]]; then echo "$E2E_MONGOD"; return; fi
  if command -v mongod >/dev/null 2>&1; then command -v mongod; return; fi
  local c; c="$(ls "$ROOT"/backend/node_modules/.cache/mongodb-memory-server/mongod* 2>/dev/null | head -1)"
  [[ -n "$c" ]] && echo "$c" || echo mongod
}

wait_for() {  # wait_for URL SECONDS
  local i; for ((i = 0; i < $2; i++)); do
    curl -s -o /dev/null --max-time 2 "$1" && return 0; sleep 1
  done
  echo "timed out waiting for $1 (see $LOG)" >&2; return 1
}

# Dummy values only: nothing here is a credential.
export NODE_ENV=test JWT_ACCESS_SECRET=smoke-access JWT_REFRESH_SECRET=smoke-refresh
export ENCRYPTION_KEY=6470df2f901f61569c667de386f434a71f51e1f2d44c913698859b16e42054cd
export GOOGLE_CLIENT_ID=x GOOGLE_CLIENT_SECRET=x GITHUB_CLIENT_ID=x GITHUB_CLIENT_SECRET=x
export BINANCE_API_KEY=x BINANCE_API_SECRET=x
export FRONTEND_URL=http://localhost:3000 BACKEND_URL=http://localhost:3001 ALLOWED_ORIGINS=http://localhost:3000
export GROQ_API_KEY=bogus OPENROUTER_API_KEY=bogus

# A stale server on one of our ports would answer the smoke checks instead of the fresh stack.
for p in 3000 3001 8000 "$PORT_MONGO"; do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$p/"; then echo "REFUSING: port $p is already in use" >&2; exit 2; fi
done

echo "== mongod on :$PORT_MONGO"
"$(find_mongod)" --dbpath "$DBPATH" --port "$PORT_MONGO" --bind_ip 127.0.0.1 >"$LOG/mongod.log" 2>&1 &
PIDS+=($!)
wait_for "http://127.0.0.1:${PORT_MONGO}" 30 || exit 1

echo "== seed (local only)"
( cd "$ROOT/backend" && npm run seed >"$LOG/seed.log" 2>&1 && npm run seed:audit >"$LOG/seed-audit.log" 2>&1 ) \
  || { echo "seed failed"; tail -20 "$LOG/seed.log" "$LOG/seed-audit.log"; exit 1; }
tail -3 "$LOG/seed-audit.log"

echo "== backend :3001"
( cd "$ROOT/backend" && PORT=3001 npm run build >"$LOG/backend-build.log" 2>&1 && PORT=3001 exec node dist/index.js ) >"$LOG/backend.log" 2>&1 &
PIDS+=($!)
echo "== ml-service :8000"
PY="$ROOT/ml-service/.venv/bin/python"; [[ -x "$PY" ]] || PY=python3
( cd "$ROOT/ml-service" && exec "$PY" -m uvicorn main:app --port 8000 ) >"$LOG/ml.log" 2>&1 &
PIDS+=($!)
echo "== frontend :3000"
# production-like: relative /api, rewritten to the backend by BACKEND_PROXY_URL (as on Vercel)
( cd "$ROOT/frontend" && export PORT=3000 BACKEND_PROXY_URL=http://localhost:3001 NEXT_PUBLIC_ML_URL=http://localhost:8000 \
    NEXT_PUBLIC_SITE_URL=http://localhost:3000 && npm run build >"$LOG/frontend-build.log" 2>&1 \
  && exec npm run start ) >"$LOG/frontend.log" 2>&1 &
PIDS+=($!)

wait_for http://localhost:3001/health 180 || exit 1
wait_for http://localhost:8000/health 120 || exit 1
wait_for http://localhost:3000 300 || exit 1

echo "== smoke"
bash "$ROOT/scripts/smoke_prod.sh" http://localhost:3001 http://localhost:8000 http://localhost:3000
rc=$?
echo "== demo audit via API (status only)"
curl -s -o /dev/null -w 'GET /api/audit/score?userId=demo-disciplined -> %{http_code}\n' "http://localhost:3001/api/audit/score?userId=demo-disciplined"
exit $rc
