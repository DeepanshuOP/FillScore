"""Generate the committed demo Council runs (Phase 1b.5, F-09). MAKES LIVE LLM CALLS.

Anonymous visitors never trigger a live Council run on a demo account; they are served a stored
run or the fixture this script writes to ml-service/demo_runs/<demo-id>.json.

For each of the 3 eval demo users it loads that account's packets from MongoDB (read-only), runs
one live Council through the free-model router (9 base calls, plus any grounding regenerations and
one forced re-reason; all counted in the `llm_usage` collection),
and writes the fixture only if agents.acceptance.accept_run accepts it (structured rules, not a
failure-string sweep). A rejected run is reported and skipped; --retries N re-runs it.

Needs: working MONGODB_URI credentials and at least one provider key (GROQ_API_KEY today).
Writes to MongoDB: `llm_usage` counters always; `council_runs` only with --persist.
Refuses to run without --yes.

Run from ml-service/:
    .venv/bin/python scripts/generate_demo_runs.py --yes
    .venv/bin/python scripts/generate_demo_runs.py --yes --persist      # also store in council_runs
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.env_loader import load_service_env  # noqa: E402

DEMO_USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]   # eval.harness.EVAL_USERS
SYMBOL = "BTCUSDT"                                                      # what the dashboard asks for
OUT_DIR = ROOT / "demo_runs"


GAP_SECONDS = 90   # Groq counts tokens per minute; space the users so one run never spills into the next


async def generate(persist: bool, users: list[str], max_calls: int | None = None,
                   gap_s: float = GAP_SECONDS, sleep=asyncio.sleep, retries: int = 0) -> int:
    from agents.acceptance import accept_run, string_sweep
    from agents.council import load_packets, run_council_pipeline
    from agents.llm_router import get_default_router

    router = get_default_router()
    if not await router.has_capacity():
        print("Refused: the daily AI budget in llm_usage has no room for a full run today.")
        return 1

    router.http_attempt_cap = max_calls  # hard cap on HTTP attempts for the whole script (retries included)
    router.http_attempts = 0
    failures = 0
    ran_any = False   # a council has actually run, so the next one must wait out the gap
    for account in users:
        done = False
        for attempt in range(retries + 1):
            if max_calls is not None and router.http_attempts >= max_calls:   # cap first: no point sleeping
                print(f"{account}: skipped, the call budget of {max_calls} is used up")
                break
            if ran_any and gap_s:
                await sleep(gap_s)
            before = router.http_attempts
            (fee, risk, liq, alpha), trades = await load_packets(account, SYMBOL)
            if fee.trade_count == 0:
                print(f"{account}: no trades for {SYMBOL}, skipped")
                break
            result = await run_council_pipeline(account, account, SYMBOL, fee, risk, liq, alpha,
                                                llm=router, persist=persist, trades=trades)
            ran_any = True
            print(f"{account}: {router.http_attempts - before} HTTP attempts (total {router.http_attempts})")
            doc = result.model_dump(mode="json")
            acc = accept_run(doc)
            print(f"{account}: string sweep (secondary, not a gate): {string_sweep(json.dumps(doc))}")
            if not acc.accepted:
                print(f"{account}: REJECTED, not written. Reasons: {acc.failures}")
                if attempt < retries:
                    print(f"{account}: retrying ({attempt + 1}/{retries})")
                continue
            for note in acc.notes:
                print(f"{account}: note: {note}")
            path = OUT_DIR / f"{account}.json"
            path.write_text(json.dumps({
                "account_id": account,
                "symbol": SYMBOL,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "council_result": doc,
            }, indent=2) + "\n", encoding="utf-8")
            print(f"{account}: {result.synthesis.overallRating}, {result.tokenUsage.get('total_tokens')} tokens -> {path}")
            done = True
            break
        if not done:
            failures += 1
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yes", action="store_true", help="confirm live LLM calls and DB reads/writes")
    ap.add_argument("--persist", action="store_true", help="also insert the runs into council_runs")
    ap.add_argument("--user", action="append", choices=DEMO_USERS, help="only these demo users")
    ap.add_argument("--max-calls", type=int, default=None,
                    help="hard cap on HTTP attempts across all users (retries included)")
    ap.add_argument("--retries", type=int, default=0,
                    help="re-run a rejected user up to N more times (after the gap, while the call cap has room)")
    args = ap.parse_args()
    if not args.yes:
        print("This makes live LLM calls (9+ per demo user) and writes llm_usage. Re-run with --yes.")
        return 2
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    return asyncio.run(generate(args.persist, args.user or DEMO_USERS, max_calls=args.max_calls,
                                  retries=args.retries))


if __name__ == "__main__":
    sys.exit(main())
