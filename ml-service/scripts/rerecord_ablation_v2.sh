#!/usr/bin/env bash
# Re-record the single-call vs Council ablation on the rebuilt demos (M2). FOR DEEPANSHU TO RUN.
# DRY RUN BY DEFAULT: prints every step, the budget and the checks, and runs nothing that calls an LLM or writes.
#
#   bash ml-service/scripts/rerecord_ablation_v2.sh            # dry run: print the plan
#   bash ml-service/scripts/rerecord_ablation_v2.sh --run      # run it (spends free-tier LLM calls)
#
# Preconditions (checked below, read-only):
#   1. The rebuilt demos are seeded (backend/src/scripts/seedDemoV2.ts --apply, Deepanshu) and the re-lock is applied.
#   2. GROQ_API_KEY is set (checked by name only), and MONGODB_URI points at the seeded database (read-only use).
# Budget: 3 users x 3 Council runs (9 calls each = 81 calls) + 3 users x 3 single runs (9 calls). The Groq free tier
# allows about 8 full Council runs a day, so the script runs the single arm and 4 Council runs on day 1 (--day 1) and
# the other 5 Council runs on day 2 (--day 2). >= 65 s between runs (evals/live_eval.py GAP_S).
set -euo pipefail
cd "$(dirname "$0")/.."                                    # ml-service

RUN=0; DAY=1
for a in "$@"; do
  case "$a" in
    --run) RUN=1 ;;
    --day) ;;
    1|2) DAY="$a" ;;
    *) echo "unknown argument: $a" >&2; exit 2 ;;
  esac
done

step() { echo; echo "== $*"; }
do_or_print() { if [ "$RUN" = 1 ]; then echo "+ $*"; "$@"; else echo "would run: $*"; fi; }

step "0. preconditions (read-only)"
if [ -z "${GROQ_API_KEY:-}" ]; then echo "GROQ_API_KEY is not set"; [ "$RUN" = 1 ] && exit 1; else echo "GROQ_API_KEY: set"; fi
if [ -z "${MONGODB_URI:-}" ]; then echo "MONGODB_URI is not set"; [ "$RUN" = 1 ] && exit 1; else echo "MONGODB_URI: set"; fi
# Read-only check that the rebuilt demos are seeded (demo-moderate has 245 orders after seedDemoV2 --apply).
if [ -n "${MONGODB_URI:-}" ]; then
  n=$(.venv/bin/python -c "import os; from pymongo import MongoClient; c = MongoClient(os.environ['MONGODB_URI'], serverSelectionTimeoutMS=8000); print(c.get_database(os.environ.get('MONGO_DB_NAME', 'fillscore')).orders.count_documents({'accountId': 'demo-moderate'}))" 2>/dev/null || echo "?")
  echo "demo-moderate orders in the database: $n (expected 245)"
  if [ "$RUN" = 1 ] && [ "$n" != "245" ]; then echo "refusing: the rebuilt demos are not seeded"; exit 1; fi
fi

step "1. golden set v3: packets from the rebuilt demos (read-only against Mongo; writes evals/golden/v3/)"
[ "$DAY" = 1 ] && do_or_print .venv/bin/python -m evals.dump_golden_packets --set v3
echo "Then copy required_evidence review: the dump carries it over from the newest recorded set."

step "2. day $DAY: live runs (recordings saved to evals/recordings/, nothing written to Atlas: persist=False)"
# Runs 1-3 of every arm and user are the recorded golden v1/v2 runs; recorded LLM output is never overwritten, so the
# rebuilt-demo runs are numbered 4-6. Refuse to start if any target file already exists.
# (evals/live_eval.py also skips an existing recording, so runs 1-3 are safe twice over.)
if [ "$DAY" = 1 ]; then targets="single:4 single:5 single:6 council:4"; else targets="council:6"; fi
for t in $targets; do arm=${t%%:*}; n=${t##*:}; for u in demo-disciplined demo-moderate demo-aggressive; do
  if [ -e "evals/recordings/$arm-$u-$n.json" ]; then echo "refusing: evals/recordings/$arm-$u-$n.json exists"; exit 1; fi
done; done
if [ "$DAY" = 1 ]; then
  do_or_print .venv/bin/python -m evals.live_eval --arm single --runs 3 --cap 40 --start 4
  do_or_print .venv/bin/python -m evals.live_eval --arm council --runs 1 --cap 70 --start 4
  do_or_print .venv/bin/python -m evals.live_eval --arm council --runs 1 --cap 30 --start 5 --users demo-disciplined
else
  do_or_print .venv/bin/python -m evals.live_eval --arm council --runs 1 --cap 50 --start 5 --users demo-moderate demo-aggressive
  do_or_print .venv/bin/python -m evals.live_eval --arm council --runs 1 --cap 70 --start 6
fi
echo "NOTE: evals/ablation.py tabulates every recording; before reporting, tabulate runs 4-6 (golden v3) apart from runs 1-3."

step "3. verify every run actually executed (the verify-council-run checks)"
echo "For each new recording: grep for 'failed:', 'Max retries', '_default_', '429', 'rate limit', 'RouterExhausted',"
echo "'REJECTED', 'fell back'; confirm n_calls == 9 on Council runs; check user_id and created_at; read the text."
do_or_print bash -c "grep -lE 'failed:|Max retries|_default_|HTTP 429|status 429|rate limit|RouterExhausted|REJECTED|fell back' evals/recordings/*-[456].json || echo 'no failure markers in runs 4-6'"

step "4. gate and tabulate (offline)"
do_or_print .venv/bin/python evals/run_offline.py
do_or_print .venv/bin/python evals/ablation.py --check

echo
[ "$RUN" = 1 ] && echo "done." || echo "dry run: nothing was run. Add --run (and --day 2 on the second day)."
