"""Structured acceptance check for a Council run (1d.6). Reads a file only; no network, no DB.

    .venv/bin/python scripts/check_council_run.py <fixture-or-doc.json> [--log <stdout file>]

Accepts a demo fixture (`council_result` key) or a bare CouncilResult dict. Exit 0 accepted, 1 rejected.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.acceptance import accept_run, string_sweep  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--log", default=None, help="stdout/stderr file of the run, for the string sweep")
    args = ap.parse_args(argv)
    text = pathlib.Path(args.file).read_text(encoding="utf-8")
    doc = json.loads(text)
    result = doc.get("council_result", doc)
    acc = accept_run(result)
    print("ACCEPTED" if acc.accepted else "REJECTED")
    for f in acc.failures:
        print(f"FAIL: {f}")
    for n in acc.notes:
        print(f"note: {n}")
    if args.log:
        text += "\n" + pathlib.Path(args.log).read_text(encoding="utf-8", errors="replace")
    print(f"string sweep (secondary, not a gate): {string_sweep(text)}")
    return 0 if acc.accepted else 1


if __name__ == "__main__":
    sys.exit(main())
