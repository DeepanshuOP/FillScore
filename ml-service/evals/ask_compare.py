"""Measure the two Ask answer paths on the same questions (seventh order, B3). Pure helpers and one async runner; the live script is
`scripts/compare_ask_paths.py`.

A run record: {"path": "free"|"claims", "question", "result" (the ask_flow result, verbatim), "models", "http_attempts" (live HTTP calls this
question used, retries included), "outcomes" (the router's outcome of each attempt of the answering call), "raw_answer" (what the model
returned before code touched it: the placeholder text of the free path, the claims JSON of the claims path)}.

Buckets, exclusive, per question:
  refused    no tool was needed (the planner chose none), so no answer was written;
  degraded   the model's answer was not used and the code-built answer was shown;
  written    the model's output was used as the model wrote it: free path, the placeholder text rendered by code equals the shown answer
             (code removed and changed nothing); claims path, the claims passed every check and the sentences are the templates over them;
  altered    free path only: shown, but code removed or changed part of what the model wrote (a sentence with its own number, an advising or
             causal word, a link, a fourth sentence).
`schema_invalid`: the answering call had at least one invalid reply (not JSON, or not the expected shape), or the answer fell back for that reason.
"""
from __future__ import annotations

import json
import re

from agents.render import render


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def classify(record: dict, ctx: dict) -> str:
    r = record["result"]
    if not r.get("tools_used"):
        return "refused"
    if r.get("degraded"):
        return "degraded"
    if record["path"] == "claims":
        return "written"
    raw = record.get("raw_answer")
    if raw is None:
        return "altered"
    return "written" if _norm(render(raw, ctx).text) == _norm(r["answer"]) else "altered"


def schema_invalid(record: dict) -> bool:
    return "invalid_json" in record.get("outcomes", []) or record["result"].get("fallback") == "schema_invalid"


def summarize(records: list[dict], ctxs: list[dict]) -> dict:
    counts = {"written": 0, "altered": 0, "degraded": 0, "refused": 0}
    for rec, ctx in zip(records, ctxs):
        counts[classify(rec, ctx)] += 1
    total = sum(r["http_attempts"] for r in records)
    return {"questions": len(records), **counts, "schema_invalid": sum(schema_invalid(r) for r in records),
            "calls_total": total, "calls_mean": round(total / len(records), 2) if records else 0.0}


class _Capture:
    """Wraps a router: remembers what the answering (synthesis) call returned, passes everything else through."""

    def __init__(self, router):
        self._router, self.last = router, None

    async def complete(self, role, *a, **k):
        out = await self._router.complete(role, *a, **k)
        if role == "synthesis":
            self.last = out
        return out

    def __getattr__(self, name):
        return getattr(self._router, name)


async def run_question(router, path: str, question: str, load, telemetry: list | None = None) -> dict:
    from agents.ask import ask_flow

    tel = telemetry if telemetry is not None else []
    mark = len(tel)
    cap = _Capture(router)
    before = router.http_attempts
    result = await ask_flow(question, load, cap, telemetry=tel, mode=path)
    mine = tel[mark:]
    raw = None
    if cap.last is not None:
        raw = cap.last.answer if path == "free" else json.dumps(cap.last.model_dump())
    return {
        "path": path, "question": question, "result": result,
        "models": [f"{t.get('provider')}/{t.get('model')}" for t in mine if isinstance(t, dict) and t.get("outcome") == "ok"],
        "http_attempts": router.http_attempts - before,
        "outcomes": [t["outcome"] for t in mine if isinstance(t, dict) and t.get("role") == "synthesis"],
        "raw_answer": raw,
    }
