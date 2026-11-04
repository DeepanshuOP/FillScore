"""Mark legacy council_runs (written before the `degraded` field existed) honestly (1c.7).

Dry run is the default and writes nothing. --apply sets, per matched doc:
    legacy: True, degraded: <bool>, degraded_reasons: [...]

Run from ml-service/:
    .venv/bin/python scripts/migrate_legacy_council_runs.py            # dry run
    .venv/bin/python scripts/migrate_legacy_council_runs.py --dry-run  # same, explicit
    .venv/bin/python scripts/migrate_legacy_council_runs.py --apply    # writes
Uses MONGODB_URI and MONGO_DB_NAME (default fillscore). The URI is never printed.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import pathlib
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

EXPECTED_CALLS = 9
SPECIALISTS = ("liquidity", "alpha", "risk", "fee")
OUTCOMES = ("degraded_low_calls", "degraded_fallback", "ok")


def _walk_strings(node: Any):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from _walk_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk_strings(v)


def _fallback_markers(result: Any) -> list[str]:
    if not isinstance(result, dict):
        return []
    found: list[str] = []
    for name in SPECIALISTS:
        spec = result.get(name)
        if isinstance(spec, dict) and "agent_failed" in (spec.get("flags") or []):
            found.append(f"{name} agent_failed")
    if any(s == "Agent unavailable" for s in _walk_strings(result)):
        found.append("Agent unavailable")
    synth = result.get("synthesis")
    if isinstance(synth, dict):
        for key in ("recommendations", "topRecommendations"):
            if any("Check API key" in s for s in _walk_strings(synth.get(key))):
                found.append("Check API key")
                break
        if synth.get("headline") == "Analysis incomplete":
            found.append("Analysis incomplete")
    debate = result.get("debate_transcript")
    if isinstance(debate, dict):
        if debate.get("prosecution_summary") == "Prosecution unavailable":
            found.append("Prosecution unavailable")
        if debate.get("defense_summary") == "Defense unavailable":
            found.append("Defense unavailable")
    return found


def classify_run(doc: dict) -> dict:
    reasons: list[str] = []
    n_calls = (doc.get("token_usage") or {}).get("n_calls")
    if isinstance(n_calls, bool) or not isinstance(n_calls, (int, float)):
        n_calls = 0
    low = n_calls < EXPECTED_CALLS
    if low:
        reasons.append(f"legacy: only {int(n_calls)} of {EXPECTED_CALLS} model calls recorded")
    markers = _fallback_markers(doc.get("council_result"))
    reasons.extend(f"legacy: fallback marker {m}" for m in markers)
    if low:
        outcome = "degraded_low_calls"
    elif markers:
        outcome = "degraded_fallback"
    else:
        outcome = "ok"
    return {"outcome": outcome, "degraded": outcome != "ok", "reasons": reasons}


def build_update(doc: dict) -> dict:
    c = classify_run(doc)
    return {"$set": {"legacy": True, "degraded": c["degraded"], "degraded_reasons": c["reasons"]}}


async def run_migration(db, apply: bool) -> None:
    projection = {"_id": 1, "run_id": 1, "token_usage": 1, "council_result": 1}
    docs = await db["council_runs"].find({"degraded": {"$exists": False}}, projection).to_list(None)
    counts = {o: 0 for o in OUTCOMES}
    samples: dict[str, list[str]] = {o: [] for o in OUTCOMES}
    for d in docs:
        o = classify_run(d)["outcome"]
        counts[o] += 1
        if len(samples[o]) < 3:
            samples[o].append(str(d.get("run_id") or d["_id"]))
    print(f"Matched: {len(docs)}")
    for o in OUTCOMES:
        print(f"  {o}: {counts[o]}  samples: {', '.join(samples[o]) or '-'}")
    if not apply:
        print("DRY RUN — no writes")
        return
    modified = 0
    for d in docs:
        res = await db["council_runs"].update_one({"_id": d["_id"]}, build_update(d))
        modified += res.modified_count
    print(f"Modified: {modified}")


async def _main(apply: bool) -> int:
    from motor.motor_asyncio import AsyncIOMotorClient

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is not set")
        return 1
    kwargs = {}
    if uri.startswith("mongodb+srv"):
        import certifi

        kwargs["tlsCAFile"] = certifi.where()
    client = AsyncIOMotorClient(uri, **kwargs)
    try:
        await run_migration(client[os.environ.get("MONGO_DB_NAME", "fillscore")], apply)
    finally:
        client.close()
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true", help="write the updates (default is a dry run)")
    g.add_argument("--dry-run", action="store_true", help="explicit dry run (the default)")
    args = ap.parse_args()
    from config.env_loader import load_service_env

    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    return asyncio.run(_main(args.apply))


if __name__ == "__main__":
    sys.exit(main())
