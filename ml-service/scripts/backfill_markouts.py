"""Backfill markout and spread enrichment onto existing trades. Run by a human, never by an agent.

  .venv/bin/python scripts/backfill_markouts.py                  # DRY RUN (default): counts, first 5 rows, cache size
  .venv/bin/python scripts/backfill_markouts.py --apply          # writes postPrices, spreadBps, halfSpreadBps, markoutVersion
  options: --user-id <id>  one account only | --include-demo  also demo-* accounts | --cache-dir <dir>

Writes ONLY those four new fields (never a score or grade) and skips docs already at the current version, so a
re-run is a no-op. Public data comes from data.binance.vision (1s klines, SHA-256 verified, cached on disk).
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.env_loader import load_service_env  # noqa: E402
from marketdata import binance_vision as bv  # noqa: E402
from marketdata.enrich import run_backfill  # noqa: E402

DEFAULT_CACHE = ROOT.parent / ".work" / "marketcache"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="write the new fields (default is a dry run)")
    ap.add_argument("--user-id")
    ap.add_argument("--include-demo", action="store_true")
    ap.add_argument("--cache-dir", default=str(DEFAULT_CACHE))
    a = ap.parse_args(argv)
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    uri = os.getenv("MONGODB_URI")
    if not uri:
        print("MONGODB_URI is not set")
        return 2
    from pymongo import MongoClient
    client = MongoClient(uri)
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "fillscore"
    col = client[db_name]["trades"]
    rep = run_backfill(col, lambda s, d: bv.fetch_day(s, d, a.cache_dir), apply=a.apply, cache_dir=a.cache_dir,
                       include_demo=a.include_demo, user_id=a.user_id)
    print(json.dumps({k: v for k, v in rep.items() if k != "first_rows"}, indent=1))
    for r in rep["first_rows"]:
        print(json.dumps(r, default=str))
    print("APPLIED" if a.apply else "DRY RUN: nothing written. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
