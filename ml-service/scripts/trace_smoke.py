"""End-to-end tracing check with NO LLM call.

Initialises tracing exactly as production does (observability.tracing.init_tracing), emits a root span
`trace-smoke` with one child shaped like an LLM call (stubbed response, demo account), flushes, and reports
the exporter's HTTP status. Never prints key values: only whether each variable is present.

  .venv/bin/python scripts/trace_smoke.py [--json]

Exit 0: ingestion accepted. 2: keys absent. 3: export failed (reason printed). Then look for `trace-smoke`
in Langfuse -> Tracing (project fillscore-council).
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

VARS = ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_HOST")


def run(env=None) -> dict:
    from observability import tracing
    env = os.environ if env is None else env
    present = {k: bool((env.get(k) or "").strip()) for k in VARS}
    present["LANGFUSE_HOST"] = bool(tracing.langfuse_host(env))   # LANGFUSE_BASE_URL counts as the host
    out = {"ok": False, "exit": 2, "vars_present": present, "http_status": None, "trace_id": None, "reason": None}
    if not tracing.init_tracing(env):
        missing = [k for k, v in present.items() if not v]
        out["reason"] = "missing env: " + ", ".join(missing)
        return out
    out["trace_id"] = tracing.start_run("demo-moderate", name="trace-smoke")
    tracing.emit_attempt(role="smoke", provider="stub", model="stub-model", attempt=1, latency_ms=12.0,
                         prompt_tokens=7, completion_tokens=3, outcome="ok",
                         system="You are a stub.", user="Grade nothing; this is a smoke test.",
                         output="stubbed response")
    tracing.finish_run("ok")
    flushed = tracing.shutdown_tracing()
    st = tracing.export_status()
    out["http_status"] = st["last_http_status"]
    if flushed and st["last_http_status"] is not None and 200 <= st["last_http_status"] < 300:
        out.update(ok=True, exit=0)
    else:
        out.update(exit=3, reason=f"export failed (http_status={st['last_http_status']}, error={st['last_error']})")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="machine-readable result (for CI later)")
    args = ap.parse_args()
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    res = run()
    if args.json:
        print(json.dumps(res))
    else:
        print("env: " + ", ".join(f"{k}={'present' if v else 'ABSENT'}" for k, v in res["vars_present"].items()))
        print(f"trace_id={res['trace_id']} http_status={res['http_status']}")
        print("OK: ingestion accepted. Check Langfuse -> Tracing for 'trace-smoke'." if res["ok"]
              else f"FAIL: {res['reason']}")
    return res["exit"]


if __name__ == "__main__":
    sys.exit(main())
