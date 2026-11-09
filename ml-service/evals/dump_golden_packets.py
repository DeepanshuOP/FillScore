"""READ-ONLY: write (or check) the deterministic packets for the golden sets.

  python -m evals.dump_golden_packets --set v2        # writes evals/golden/v2/<case>.json + MANIFEST.json if absent
  python -m evals.dump_golden_packets --check v2      # rebuilds the packets and compares every content_hash

Demo users' trades are read from the configured Mongo (no writes); edge cases are built in code (no DB).
A set whose MANIFEST says recorded: true is never written: its packets are what recordings were made against.
`required_evidence` (hand-written, not produced by the packet code) is carried over from the set being rewritten,
else from the newest recorded set, so a regeneration never drops it."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from config.env_loader import load_service_env
from evals import golden_sets

USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
PACKET_KEYS = ("fee", "risk", "liquidity", "alpha")


def resolve_out_dir(set_name: str, root: str | None = None) -> str:
    """The directory a regeneration may write to; refuses a recorded set."""
    root = root or golden_sets.GOLDEN_ROOT
    if not set_name or os.path.basename(set_name) != set_name or set_name in (".", ".."):
        raise SystemExit(f"refusing set name {set_name!r}: give a plain directory name under evals/golden/")
    d = os.path.join(root, set_name)
    # anything but an explicit boolean false counts as recorded (a string "true", a typo, a missing key)
    if os.path.exists(os.path.join(d, "MANIFEST.json")) and golden_sets.read_manifest(set_name, root).get("recorded") is not False:
        raise SystemExit(f"refusing to write {set_name}: its manifest says recorded: true "
                         f"(recordings were made against these packets; make a new set instead)")
    return d


def _seed_required_evidence(set_name: str, root: str | None) -> dict[str, dict]:
    """gid -> required_evidence from the set being rewritten, else the newest recorded set."""
    for name in [set_name] + sorted(golden_sets.recorded_sets(root), reverse=True):
        try:
            g = golden_sets.load_golden(name, root)
        except FileNotFoundError:
            continue
        if g:
            return {gid: v["required_evidence"] for gid, v in g.items() if "required_evidence" in v}
    return {}


async def _demo_contexts() -> dict[str, tuple[int, dict]]:
    from agents.metrics.loader import load_run_inputs
    from agents.render import packet_ctx
    out = {}
    for u in USERS:
        (fee, risk, liq, alpha), trades = await load_run_inputs(u, "BTCUSDT")
        out[u] = (len(trades), packet_ctx(fee, risk, liq, alpha))
    return out


def _reachable(timeout_ms: int = 2000) -> bool:
    from motor.motor_asyncio import AsyncIOMotorClient

    async def ping() -> bool:
        c = AsyncIOMotorClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"), serverSelectionTimeoutMS=timeout_ms)
        try:
            await c.admin.command("ping")
            return True
        except Exception:
            return False
        finally:
            c.close()
    return asyncio.run(ping())


def check_demo_hashes(set_name: str, root: str | None = None) -> list[str] | None:
    """Mismatches between the stored demo packets and a fresh read-only rebuild; None if Mongo is unreachable."""
    if not _reachable():
        return None
    stored = golden_sets.load_golden(set_name, root)
    bad = []
    for u, (n, ctx) in asyncio.run(_demo_contexts()).items():
        if stored[u].get("n_trades") != n:
            bad.append(f"{u}: n_trades {n} != stored {stored[u].get('n_trades')}")
        for k in PACKET_KEYS:
            if ctx[k]["content_hash"] != stored[u]["packet"][k]["content_hash"]:
                bad.append(f"{u}.{k}: {ctx[k]['content_hash']} != stored {stored[u]['packet'][k]['content_hash']}")
    return bad


def _write(path: str, obj: dict) -> None:
    with open(path, "w") as f:
        json.dump(obj, f, indent=1, sort_keys=True, default=str)


def dump(set_name: str, root: str | None = None) -> None:
    from agents.metrics.loader import build_all_packets
    from agents.render import packet_ctx
    from config.versions import METRICS_VERSION, PROMPT_VERSION, SINGLE_PROMPT_VERSION
    from evals.edge_cases import REQUIRED_EVIDENCE, edge_trades
    d = resolve_out_dir(set_name, root)
    seed = _seed_required_evidence(set_name, root)
    demos = asyncio.run(_demo_contexts())   # read before anything is written
    os.makedirs(d, exist_ok=True)
    for u, (n, ctx) in demos.items():
        doc = {"id": u, "kind": "demo", "symbol": "BTCUSDT", "n_trades": n, "packet": ctx}
        if u in seed:
            doc["required_evidence"] = seed[u]
        _write(os.path.join(d, f"{u}.json"), doc)
        print(u, n, "trades")
    for name, trades in edge_trades().items():
        ctx = packet_ctx(*build_all_packets(trades, name, "BTCUSDT"))
        _write(os.path.join(d, f"{name}.json"), {"id": name, "kind": "edge", "symbol": "BTCUSDT", "n_trades": len(trades),
                                                 "packet": ctx, "required_evidence": REQUIRED_EVIDENCE})
        print(name, len(trades))
    if not os.path.exists(os.path.join(d, "MANIFEST.json")):
        _write(os.path.join(d, "MANIFEST.json"),
               {"prompt_version": PROMPT_VERSION, "single_prompt_version": SINGLE_PROMPT_VERSION,
                "metrics_version": METRICS_VERSION, "recorded": False, "note": "re-record after 4R-2"})


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--set", dest="set_name", help="golden set directory to (re)write; never a recorded set")
    g.add_argument("--check", dest="check_set", help="golden set to verify against a fresh rebuild")
    a = ap.parse_args(argv)
    if a.set_name:
        dump(a.set_name)
        return 0
    bad = check_demo_hashes(a.check_set)
    if bad is None:
        print("Mongo unreachable: demo packets not checked")
        return 2
    for b in bad:
        print(b)
    print(f"{a.check_set}: {'MISMATCH' if bad else 'demo packets reproduce hash-identically'}")
    return 1 if bad else 0


if __name__ == "__main__":
    _root = os.path.join(os.path.dirname(__file__), "..")
    load_service_env(os.path.join(_root, ".env"), os.path.join(_root, "..", "backend", ".env"))
    sys.exit(main())
