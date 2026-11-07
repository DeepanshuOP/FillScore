"""Move the 4a estimator dict out of Trade.spreadBps into Trade.spreadEstimates. Run by a human, never by an agent.

  .venv/bin/python scripts/migrate_spread_estimates.py                 # DRY RUN (default): prints JSON counts
  .venv/bin/python scripts/migrate_spread_estimates.py --apply         # writes (non-demo accounts)
  options: --include-demo  also demo-* accounts

Only touches docs whose spreadBps is a dict: sets spreadEstimates = {cs, ar, n_pairs, version: 1} and $unsets
spreadBps. Numeric spreadBps and docs without it are never touched. Idempotent: a second run moves nothing.

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

RESTORE_BLOCKED = {"status": "blocked", "reason": "no exact source for original demo spreadBps"}
OWNER = "ml-service/scripts/backfill_markouts.py"


def migrate(col, apply: bool = False, include_demo: bool = False) -> dict:
    query: dict = {} if include_demo else {"userId": {"$not": {"$regex": "^demo-"}}}
    rep = {"apply": apply, "considered": 0, "to_move": 0, "already_moved": 0, "restore": RESTORE_BLOCKED}
    for d in list(col.find(query)):
        rep["considered"] += 1
        sb = d.get("spreadBps")
        if not isinstance(sb, dict):
            if "spreadEstimates" in d:
                rep["already_moved"] += 1
            continue
        rep["to_move"] += 1
        est = {"cs": sb.get("cs"), "ar": sb.get("ar"), "n_pairs": sb.get("n_pairs"), "version": 1}
        if apply:
            col.update_one({"_id": d["_id"]}, {"$set": {"spreadEstimates": est}, "$unset": {"spreadBps": ""}})
    return rep


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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
    print("APPLIED" if a.apply else "DRY RUN: nothing written. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
