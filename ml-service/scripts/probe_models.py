"""Live capability probe for the free-model routes (Phase 1b.7). MAKES REAL LLM CALLS.

For every model in config/llm_routes.yaml whose provider key env var is present, sends the REAL
specialist (Fee Optimizer) and synthesis prompts built from tests/fixtures/probe_packet.json
(no database), one attempt each (no retries, no fallback), and records per call:
HTTP status, JSON extraction, Pydantic validation, latency, tokens, and grounding violations after
rendering (agents.grounding.check over the same text fields the pipeline grounds: stray numerals and
unknown placeholders).

Hard budget: at most CALLS_PER_MODEL (2, limit 3) calls per model and MAX_TOTAL_CALLS (15) overall.
Keys are read from the environment by name only and never printed.

Run from ml-service/:  .venv/bin/python -m scripts.probe_models [--out ../.work/probe_results.md]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pydantic import ValidationError  # noqa: E402

from agents import fee_optimizer, synthesis  # noqa: E402
from agents.grounded_call import collect  # noqa: E402
from agents.grounding import check  # noqa: E402
from agents.render import CF_DUMMY  # noqa: E402
from agents.llm_client import extract_json_from_response, status_of, usage_of  # noqa: E402
from agents.llm_router import load_routes  # noqa: E402
from agents.schemas import FeeVerdict, SynthesisLLMOutput, TradeContext  # noqa: E402
from config.env_loader import load_service_env  # noqa: E402

CALLS_PER_MODEL = 2
MAX_TOTAL_CALLS = 15
FIXTURE = ROOT / "tests" / "fixtures" / "probe_packet.json"

# Fixed specialist labels for the synthesis prompt (labels only: no numbers originate here).
VERDICTS = {
    "liquidity_scout": {"agent": "liquidity_scout", "liquidityRating": "POOR", "severity": "HIGH", "confidence": 0.2,
                        "cited_evidence": ["avg_slippage_bps"], "flags": []},
    "alpha_architect": {"agent": "alpha_architect", "alphaRating": "NEGATIVE", "severity": "MEDIUM", "confidence": 0.1,
                        "cited_evidence": ["avg_vwap_deviation_bps"], "flags": []},
    "risk_auditor": {"agent": "risk_auditor", "riskLevel": "MEDIUM", "severity": "MEDIUM", "confidence": 0.1,
                     "cited_evidence": ["adverse_rate"], "flags": []},
    "fee_optimizer": {"agent": "fee_optimizer", "feeRating": "WASTEFUL", "severity": "HIGH", "confidence": 0.1,
                      "cited_evidence": ["maker_ratio"], "flags": []},
}
DEBATE = {"prosecution_summary": "Taker-heavy execution raised fees (maker_ratio).",
          "defense_summary": "Part of the slippage came from market conditions (adverse_rate).",
          "key_dispute": "Whether fee drag was avoidable."}


class _Packet:
    """Duck-types a MetricsPacket for the prompt builders."""

    def __init__(self, d):
        self._d = d
        self.total_fee_paid_usd = d.get("total_fee_paid_usd", 0.0)

    def to_prompt_dict(self):
        return self._d


SPECIALIST_PATTERNS = [fee_optimizer.TEXT_FIELD, "flags.*"]
SYNTHESIS_PATTERNS = synthesis.TEXT_PATTERNS + [synthesis.RATIONALE_PATTERN]


def _prompts(fixture: dict):
    """(role, system, user, schema, max_tokens, text-field patterns): the pipeline's real prompts.
    No trades in the fixture: the synthesis action list says so (observations only)."""
    p = {k: _Packet(v) for k, v in fixture["packets"].items()}
    tctx = TradeContext(userId="probe", symbol=fixture["symbol"])
    return [
        ("specialist", fee_optimizer.SYSTEM_PROMPT,
         fee_optimizer.build_user_prompt(tctx, p["fee"], {"fee": fixture["packets"]["fee"]}), FeeVerdict,
         fee_optimizer.MAX_TOKENS, SPECIALIST_PATTERNS),
        ("synthesis", synthesis.SYNTHESIS_SYSTEM_PROMPT,
         synthesis.build_user_prompt(tctx, VERDICTS, p["fee"], p["risk"], p["liquidity"], p["alpha"], DEBATE),
         SynthesisLLMOutput, synthesis.MAX_TOKENS, SYNTHESIS_PATTERNS),
    ]


def violations(parsed: dict | None, patterns: list[str], ctx: dict) -> list[str]:
    """Grounding violations after rendering, over the fields the pipeline grounds (rationales may
    also use {{cf.*}}), as "kind:token" strings."""
    if not isinstance(parsed, dict):
        return []
    with_cf = {**ctx, "cf": CF_DUMMY}
    found: list[str] = []
    for path, text in collect(parsed, patterns).items():
        c = check(text, with_cf if path.endswith(".rationale_text") else ctx)
        found.extend(f"{v.kind}:{v.token}" for v in c.violations)
    return found


async def probe(out_path: pathlib.Path) -> list[dict]:
    from openai import AsyncOpenAI

    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    routes = load_routes()
    fixture = json.loads(FIXTURE.read_text())
    ctx = {ns: d for ns, d in fixture["packets"].items()}
    prompts = _prompts(fixture)
    assert len(prompts) <= 3, "never more than 3 calls per model"

    providers_seen = {}
    rows: list[dict] = []
    total = 0
    for c in routes.models.values():
        provider = routes.providers[c.provider]
        key = (os.environ.get(provider.key_env) or "").strip()
        providers_seen[provider.name] = bool(key)
        if not key:
            continue
        client = AsyncOpenAI(base_url=provider.base_url, api_key=key, max_retries=0,
                             timeout=provider.timeout_s, default_headers=provider.headers or None)
        for role, system, user, schema, max_tokens, patterns in prompts[:CALLS_PER_MODEL]:
            if total >= MAX_TOTAL_CALLS:
                break
            total += 1
            row = {"provider": c.provider, "model": c.model, "role": role, "status": None, "json_ok": False,
                   "valid": False, "latency_ms": None, "tokens": 0, "ungrounded": [], "error": ""}
            kwargs = dict(model=c.model, max_tokens=int(max_tokens * c.max_tokens_factor), temperature=0.1,
                          messages=[{"role": "system", "content": system}, {"role": "user", "content": user}])
            if c.extra_body:
                kwargs["extra_body"] = dict(c.extra_body)
            t0 = time.perf_counter()
            try:
                resp = await client.chat.completions.create(**kwargs)
                row["status"] = 200
                row["tokens"] = usage_of(resp)["total_tokens"]
                raw = resp.choices[0].message.content or ""
                parsed = extract_json_from_response(raw) if raw.strip() else None
                row["json_ok"] = parsed is not None
                if parsed is not None:
                    try:
                        schema.model_validate(parsed)
                        row["valid"] = True
                    except ValidationError as ve:
                        row["error"] = f"validation: {ve.error_count()} error(s)"
                elif not raw.strip():
                    row["error"] = "empty completion"
                row["ungrounded"] = sorted(set(violations(parsed, patterns, ctx)))
            except Exception as exc:  # status and class only: never the message (could echo headers)
                row["status"] = status_of(exc)
                row["error"] = type(exc).__name__
            row["latency_ms"] = round((time.perf_counter() - t0) * 1000)
            rows.append(row)
            print(f"{c.provider}/{c.model} {role}: status={row['status']} json={row['json_ok']} "
                  f"valid={row['valid']} {row['latency_ms']}ms tokens={row['tokens']} ungrounded={row['ungrounded']} {row['error']}")
        await client.close()

    _write(out_path, rows, providers_seen, total)
    return rows


def _write(path: pathlib.Path, rows: list[dict], providers_seen: dict, total: int) -> None:
    lines = [
        "# Phase 1b.7 live capability probe",
        "",
        f"Run: {time.strftime('%Y-%m-%d %H:%M:%S %Z')} · script `ml-service/scripts/probe_models.py` · "
        f"prompts from `tests/fixtures/probe_packet.json` · one attempt per call, no retries · {total} calls in total",
        "",
        "Provider keys present (name check only): "
        + ", ".join(f"{p}={'yes' if ok else 'no'}" for p, ok in providers_seen.items()),
        "",
        "| provider/model | role | HTTP | JSON extracted | Pydantic valid | latency ms | tokens | grounding violations after rendering | note |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['provider']}/{r['model']} | {r['role']} | {r['status']} | {'yes' if r['json_ok'] else 'no'} | "
            f"{'yes' if r['valid'] else 'no'} | {r['latency_ms']} | {r['tokens']} | "
            f"{', '.join(r['ungrounded']) or '—'} | {r['error'] or ''} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT.parent / ".work" / "probe_results.md"))
    args = ap.parse_args()
    asyncio.run(probe(pathlib.Path(args.out)))
