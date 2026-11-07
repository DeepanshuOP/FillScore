"""Move the 4a estimator dict out of Trade.spreadBps into Trade.spreadEstimates. Run by a human, never by an agent.

  .venv/bin/python scripts/migrate_spread_estimates.py                 # DRY RUN (default): prints JSON counts
  .venv/bin/python scripts/migrate_spread_estimates.py --apply         # writes (non-demo accounts)
  options: --include-demo  also demo-* accounts

Only touches docs whose spreadBps is a dict: sets spreadEstimates = {cs, ar, n_pairs, version: 1} and sets
spreadBps to null (never $unset). A doc that already has spreadEstimates is a conflict and is skipped. Numeric spreadBps and docs without it are never touched. Idempotent: a second run moves nothing.

--restore-demo-spread is deliberately NOT implemented. BLOCKED: no exact source for original demo spreadBps (the seed
drew them with unseeded Math.random; no per-trade backup exists). Writing approximate values is forbidden, so after
this migration demo trades have NO spreadBps; the six stored demo audits are untouched and stay the locked grades.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from marketdata.field_registry import assert_writable  # noqa: E402

RESTORE_BLOCKED = {"status": "blocked", "reason": "no exact source for original demo spreadBps"}
WRITER = "ml-service/scripts/migrate_spread_estimates.py"
BATCH = 500


def _flush(col, ops, rep):
    for f, u in ops:
        col.update_one(f, u)
    rep["batches"] += 1


def migrate(col, apply: bool = False, include_demo: bool = False, batch_size: int = BATCH) -> dict:
    # Registry check first, before any write is queued (runs in dry-run too).
    assert_writable("Trade", "spreadEstimates", {"cs": None, "ar": None, "n_pairs": None, "version": 1}, WRITER)
    assert_writable("Trade", "spreadBps", None, WRITER)
    query: dict = {} if include_demo else {"userId": {"$not": {"$regex": "^demo-"}}}
    rep = {"apply": apply, "considered": 0, "to_move": 0, "already_moved": 0, "conflicts": 0, "batches": 0,
           "set_null_spreadBps": 0, "by_account_type": {"demo": 0, "real": 0}, "warnings": [], "restore": RESTORE_BLOCKED}
    ops: list = []
    for d in col.find(query).batch_size(batch_size):
        rep["considered"] += 1
        sb = d.get("spreadBps")
        if isinstance(sb, dict) and d.get("spreadEstimates") is not None:
            rep["conflicts"] += 1                       # never overwrite an existing spreadEstimates
        elif isinstance(sb, dict):
            rep["to_move"] += 1
            rep["set_null_spreadBps"] += 1
            rep["by_account_type"]["demo" if str(d.get("userId", "")).startswith("demo-") else "real"] += 1
            est = {"cs": sb.get("cs"), "ar": sb.get("ar"), "n_pairs": sb.get("n_pairs"), "version": 1}
            ops.append(({"_id": d["_id"]}, {"$set": {"spreadEstimates": est, "spreadBps": None}}))
        elif "spreadEstimates" in d:
            rep["already_moved"] += 1
        if len(ops) >= batch_size:
            if apply:
                _flush(col, ops, rep)
            else:
                rep["batches"] += 1
            ops = []
    if ops:
        if apply:
            _flush(col, ops, rep)
        else:
            rep["batches"] += 1
    if rep["by_account_type"]["real"] > 0:
        rep["warnings"].append(f"WARNING: {rep['by_account_type']['real']} real-user trades would lose numeric spreadBps and be skipped on re-audit")
    return rep


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter,
                                 allow_abbrev=False)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--include-demo", action="store_true")
    a = ap.parse_args(argv)
    from config.env_loader import load_service_env
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is not set")
        return 2
    from pymongo import MongoClient
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "fillscore"
    rep = migrate(MongoClient(uri)[db_name]["trades"], apply=a.apply, include_demo=a.include_demo)
    print(json.dumps(rep, indent=1))
    for w in rep["warnings"]:
        print(w)
    print("APPLIED" if a.apply else "DRY RUN: nothing written. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
