#!/usr/bin/env bash
# Production smoke test (Phase 2a, C3). Read-only: GET and OPTIONS requests only, no auth, no secrets.
#
#   scripts/smoke_prod.sh BACKEND_URL ML_URL FRONTEND_ORIGIN
#   scripts/smoke_prod.sh https://fillscore-api.onrender.com https://fillscore-ml.onrender.com https://fill-score-kappa.vercel.app
#
# Prints one PASS/FAIL line per check and a summary; exits 1 if any check failed.
# Response bodies are never printed except the short status fields named below.
set -u

if [ $# -lt 3 ] || [ $# -gt 4 ]; then
  echo "usage: $0 BACKEND_URL ML_URL FRONTEND_ORIGIN [EXPECTED_SHA]" >&2
  exit 2
fi
BACKEND="${1%/}"
ML="${2%/}"
ORIGIN="${3%/}"
EXPECTED_SHA="${4:-}"
EVIL="https://evil.example"
WAKE_TIMEOUT="${SMOKE_WAKE_TIMEOUT:-90}"   # a sleeping free Render service takes about a minute to wake
TIMEOUT="${SMOKE_TIMEOUT:-20}"

pass=0
fail=0
report() {  # report PASS|FAIL name detail
  printf '%-4s %-38s %s\n' "$1" "$2" "$3"
  if [ "$1" = PASS ]; then pass=$((pass + 1)); else fail=$((fail + 1)); fi
}

# HTTP status of a GET (000 on network failure)
status_of() {
  curl -s -o /dev/null -w '%{http_code}' --max-time "$2" "$1" 2>/dev/null || true
}

# Wake each service once (waits up to WAKE_TIMEOUT); the result is checked below.
for base in "$BACKEND" "$ML"; do
  curl -s -o /dev/null --max-time "$WAKE_TIMEOUT" "$base/health" >/dev/null 2>&1 || true
done

check_get() {  # check_get name url
  local code
  code=$(status_of "$2" "$TIMEOUT")
  if [ "$code" = 200 ]; then report PASS "$1" "HTTP $code"; else report FAIL "$1" "HTTP ${code:-000}"; fi
}

for svc in backend ml; do
  if [ "$svc" = backend ]; then base="$BACKEND"; else base="$ML"; fi
  check_get "$svc /health" "$base/health"
  check_get "$svc /ready" "$base/ready"
  check_get "$svc /version" "$base/version"
done

# Deployed commit of each service; with EXPECTED_SHA, a service on a different commit FAILs.
check_commit() {  # check_commit name url
  local commit short want
  commit=$(curl -s --max-time "$TIMEOUT" "$2" 2>/dev/null | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("commit",""))
except Exception: print("")' 2>/dev/null)
  short="${commit:0:7}"
  if [ -z "$EXPECTED_SHA" ]; then
    report PASS "$1 commit" "${short:-none reported}"
  else
    want="${EXPECTED_SHA:0:7}"
    if [ -n "$short" ] && [ "$short" = "$want" ]; then report PASS "$1 commit" "$short"
    else report FAIL "$1 commit" "live ${short:-none}, expected $want"; fi
  fi
}
check_commit backend "$BACKEND/version"
check_commit ml "$ML/version"
check_commit frontend "$ORIGIN/frontend-version"

# CORS preflight: the allowed origin must be echoed in Access-Control-Allow-Origin; evil must not be.
allow_origin_header() {  # allow_origin_header url origin method
  curl -s -o /dev/null -D - --max-time "$TIMEOUT" -X OPTIONS "$1" \
    -H "Origin: $2" \
    -H "Access-Control-Request-Method: $3" \
    -H "Access-Control-Request-Headers: authorization,content-type" 2>/dev/null \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}' | head -1
}

check_cors() {  # check_cors svc url method
  local got
  got=$(allow_origin_header "$2" "$ORIGIN" "$3")
  if [ "$got" = "$ORIGIN" ]; then
    report PASS "$1 CORS allows frontend origin" "Access-Control-Allow-Origin matches"
  else
    report FAIL "$1 CORS allows frontend origin" "Access-Control-Allow-Origin: ${got:-<absent>}"
  fi
  got=$(allow_origin_header "$2" "$EVIL" "$3")
  if [ -z "$got" ] || { [ "$got" != "$EVIL" ] && [ "$got" != "*" ]; }; then
    report PASS "$1 CORS refuses $EVIL" "Access-Control-Allow-Origin: ${got:-<absent>}"
  else
    report FAIL "$1 CORS refuses $EVIL" "Access-Control-Allow-Origin: $got"
  fi
}

check_cors backend "$BACKEND/api/health" GET
check_cors ml "$ML/ml/agents/council/stream" POST

# Binance reachability from the backend's host (an HTTP 451 here means geo-blocked).
body=$(curl -s --max-time "$TIMEOUT" "$BACKEND/api/preflight/exchanges" 2>/dev/null || true)
verdict=$(printf '%s' "$body" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("FAIL no JSON from /api/preflight/exchanges"); sys.exit()
items = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), []) if isinstance(data, dict) else []
b = next((i for i in items if isinstance(i, dict) and i.get("exchange") == "binance"), None)
if b is None:
    print("FAIL binance missing from the response")
elif b.get("status") == "reachable":
    print("PASS status reachable, HTTP %s" % b.get("httpStatus"))
else:
    print("FAIL status %s, HTTP %s" % (b.get("status"), b.get("httpStatus")))
' 2>/dev/null)
verdict=${verdict:-"FAIL could not parse the response"}
report "${verdict%% *}" "backend reaches Binance" "${verdict#* }"

# Demo report through the FRONTEND origin (the /api proxy path the browser uses): must be a real PDF.
pdf_tmp=$(mktemp)
pdf_head=$(curl -s -L --max-time "$WAKE_TIMEOUT" -o "$pdf_tmp" -w '%{http_code} %{content_type}' "$ORIGIN/api/audit/report?userId=demo-disciplined" 2>/dev/null || true)
if [ "${pdf_head%% *}" = 200 ] && [ "$(head -c 4 "$pdf_tmp")" = "%PDF" ]; then
  report PASS "demo report via frontend origin" "$pdf_head, starts with %PDF"
else
  report FAIL "demo report via frontend origin" "${pdf_head:-no response}"
fi
rm -f "$pdf_tmp"

echo "---"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
