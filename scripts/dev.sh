#!/usr/bin/env bash
# FillScore dev runner (WSL/Linux).
#   backend    Express    :3001   (backend/.env via dotenv)
#   frontend   Next.js    :3000   (frontend/.env.local)
#   ml-service FastAPI    :8000   (ml-service/.venv, ml-service/.env)
# Logs go to .work/logs/{backend,frontend,ml}.log. Ctrl-C stops all three.
#
# Env vars already set in the calling shell win over the .env files (dotenv does not override),
# so e.g. `MONGODB_URI=mongodb://127.0.0.1:27017/fillscore_dev scripts/dev.sh` points both
# services at a local mongod instead of Atlas.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.work/logs"
mkdir -p "$LOG_DIR"

# Node 20 (matches .nvmrc / Docker / CI): put nvm's newest v20.x first on PATH when installed.
WANT_NODE="$(cat "$ROOT/.nvmrc" 2>/dev/null || echo 20)"
NODE_DIR="$(ls -d "${NVM_DIR:-$HOME/.nvm}/versions/node/v${WANT_NODE}."* 2>/dev/null | sort -V | tail -1)"
if [ -n "$NODE_DIR" ]; then
  export PATH="$NODE_DIR/bin:$PATH"
else
  echo "warning: Node $WANT_NODE not found under nvm; using $(node -v 2>/dev/null || echo 'no node')" >&2
fi

if [ ! -x "$ROOT/ml-service/.venv/bin/python" ]; then
  echo "ml-service/.venv missing: cd ml-service && uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r requirements.txt" >&2
  exit 1
fi

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping FillScore dev servers..."
  for pid in "${PIDS[@]}"; do
    # Each service runs in its own process group (setsid), so kill the whole group.
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  done
  for _ in $(seq 1 20); do
    alive=0
    for pid in "${PIDS[@]}"; do kill -0 "$pid" 2>/dev/null && alive=1; done
    [ "$alive" = 0 ] && break
    sleep 0.5
  done
  for pid in "${PIDS[@]}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  echo "Stopped."
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

start() { # name dir cmd...
  local name="$1" dir="$2"; shift 2
  (cd "$dir" && exec setsid "$@") >"$LOG_DIR/$name.log" 2>&1 &
  PIDS+=("$!")
  echo "  $name  pid $!  log .work/logs/$name.log"
}

echo "Starting FillScore dev servers (node $(node -v 2>/dev/null || echo '?'))"
start ml       "$ROOT/ml-service" "$ROOT/ml-service/.venv/bin/python" -m uvicorn main:app --port 8000
start backend  "$ROOT/backend"    env PORT=3001 npm run dev
start frontend "$ROOT/frontend"   env PORT=3000 npm run dev

echo
echo "  Frontend  http://localhost:3000"
echo "  Backend   http://localhost:3001/health"
echo "  ML        http://localhost:8000/health"
echo "Ctrl-C to stop."

# Exit (and clean up the rest) as soon as any service dies.
wait -n "${PIDS[@]}"
echo "A service exited; see .work/logs/." >&2
