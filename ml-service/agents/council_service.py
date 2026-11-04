"""The request flow both Council endpoints share (Phase 1b.1 / 1b.5).

Order: demo accounts are served a stored run and never run live (F-09) → load packets → NO_DATA →
content-hash cache (zero LLM calls) → router capacity (daily AI budget) → per-account quota →
the one pipeline in agents.council.

Every refusal is a CouncilError with a typed code; the endpoints turn it into HTTP or SSE.
"""
from __future__ import annotations

import json
import pathlib
from typing import Optional

from agents.council import EventSink, load_packets, result_events, run_council_pipeline
from agents.errors import (
    DAILY_BUDGET_EXHAUSTED,
    DEMO_NOT_GENERATED,
    MODEL_UNAVAILABLE,
    NO_DATA,
    RATE_LIMIT_EXHAUSTED,
    CouncilError,
)
from agents.schemas import CouncilResult
from config.demo_users import VALID_DEMO_USERS

DEMO_RUNS_DIR = pathlib.Path(__file__).resolve().parents[1] / "demo_runs"


def _router():
    from agents import llm_router

    return llm_router.get_default_router()


async def _replay(result: CouncilResult, on_event: EventSink) -> None:
    if on_event is None:
        return
    for name, data in result_events(result):
        await on_event(name, data)


def _as_cached(doc_result: dict, run_id: Optional[str]) -> Optional[CouncilResult]:
    result = CouncilResult.model_validate(doc_result)
    if result.degraded:
        return None
    return result.model_copy(update={"cached": True, "run_id": run_id or result.run_id})


def load_demo_fixture(account_id: str, symbol: str, directory: pathlib.Path | None = None) -> Optional[CouncilResult]:
    path = (directory or DEMO_RUNS_DIR) / f"{account_id}.json"
    if account_id not in VALID_DEMO_USERS or not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("symbol") != symbol:
        return None
    return _as_cached(data["council_result"], data["council_result"].get("run_id"))


async def serve_demo_run(account_id: str, symbol: str) -> CouncilResult:
    """Latest non-degraded stored run for a demo account, else its committed fixture, else
    DEMO_NOT_GENERATED. Never a live run."""
    from agents import persistence

    result = None
    try:
        doc = await persistence.latest_demo_run(account_id, symbol)
        if doc and doc.get("council_result"):
            result = _as_cached(doc["council_result"], doc.get("run_id"))
    except Exception as exc:  # database down: the committed fixture still works
        print(f"[demo] stored-run lookup failed: {type(exc).__name__}")
    if result is None:
        result = load_demo_fixture(account_id, symbol)
    if result is None:
        raise CouncilError(DEMO_NOT_GENERATED)
    return result


async def council_flow(account_id: str, symbol: str, on_event: EventSink = None, llm=None) -> CouncilResult:
    from agents import persistence
    from config.budget import council_budget
    from config.versions import METRICS_VERSION, PROMPT_VERSION

    if account_id in VALID_DEMO_USERS:
        result = await serve_demo_run(account_id, symbol)
        await _replay(result, on_event)
        return result

    fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = await load_packets(account_id, symbol)
    if fee_pkt.trade_count == 0:
        raise CouncilError(NO_DATA)

    llm = llm or _router()
    hashes = {
        "fee": fee_pkt.content_hash,
        "risk": risk_pkt.content_hash,
        "liquidity": liquidity_pkt.content_hash,
        "alpha": alpha_pkt.content_hash,
    }
    doc = await persistence.find_cached_run(
        account_id, symbol, hashes, PROMPT_VERSION, METRICS_VERSION, llm.config.hash,
    )
    if doc and doc.get("council_result"):
        cached = _as_cached(doc["council_result"], doc.get("run_id"))
        if cached is not None:
            await _replay(cached, on_event)
            return cached

    # Checked before the per-account quota, so a refused run costs the user nothing.
    problem = await llm.capacity_problem()
    if problem == "no_provider":
        raise CouncilError(MODEL_UNAVAILABLE)
    if problem is not None:
        raise CouncilError(DAILY_BUDGET_EXHAUSTED)
    decision = council_budget.try_acquire(account_id)
    if not decision.allowed:
        code = RATE_LIMIT_EXHAUSTED if decision.reason == "account" else DAILY_BUDGET_EXHAUSTED
        raise CouncilError(code, retry_after_s=decision.retry_after_s)

    return await run_council_pipeline(
        account_id, account_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
        llm=llm, on_event=on_event,
    )
