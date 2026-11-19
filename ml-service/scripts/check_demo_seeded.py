"""Read-only: print how many orders demo-moderate has in the database (245 after seedDemoV2 --apply).

Loads the service env files itself (never source them in a shell); prints no connection detail.
Prints "?" when the database cannot be reached.
"""
from __future__ import annotations

import contextlib
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_report  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    with contextlib.redirect_stdout(io.StringIO()):
        env_report.load_and_report(["MONGODB_URI"], str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    try:
        from pymongo import MongoClient
        c = MongoClient(os.environ["MONGODB_URI"], serverSelectionTimeoutMS=8000)
        db = c.get_database(os.environ.get("MONGO_DB_NAME", "fillscore"))
        print(db.orders.count_documents({"accountId": "demo-moderate"}))
    except Exception:
        print("?")
    return 0


if __name__ == "__main__":
    sys.exit(main())
