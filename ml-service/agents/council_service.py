"""The request flow both Council endpoints share (Phase 1b.1 / 1b.5).

Order: demo accounts are served a stored run and never run live (F-09) → load packets and trades
(one read) → NO_DATA →
content-hash cache (zero LLM calls) → router capacity (daily AI budget) → per-account quota →
the one pipeline in agents.council.

Every refusal is a CouncilError with a typed code; the endpoints turn it into HTTP or SSE.
"""
from __future__ import annotations

import json
import pathlib
import re
from typing import Optional

from agents.claims import CONNECTIVE_TERMS
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


_CAUSAL = re.compile(r"\b(" + "|".join([re.escape(t) for t in CONNECTIVE_TERMS]
                                       + ["because", "therefore", "thereby", "hence", "consequently"]) + r")\b", re.I)


def states_a_cause(doc_result: dict) -> bool:
    """True when any text of a recorded run states a cause (rule I8: correlation, never causation). The claim check
    names "because of", "due to" and the like; a bare "because" slipped through in a re-record of 2026-11-14, so the
    demo serving path holds the copy to this stricter list. The grounding and claims ledgers are not copy (the claims
    ledger lists the terms it redacted) and are skipped."""
    def walk(node) -> bool:
        if isinstance(node, dict):
            return any(walk(v) for k, v in node.items() if k not in ("grounding", "claims"))
        if isinstance(node, list):
            return any(walk(v) for v in node)
        return isinstance(node, str) and _CAUSAL.search(node) is not None
    return walk(doc_result)


def _as_cached(doc_result: dict, run_id: Optional[str], demo: bool = False) -> Optional[CouncilResult]:
    result = CouncilResult.model_validate(doc_result)
    if result.degraded or (demo and states_a_cause(doc_result)):
        return None
    return result.model_copy(update={"cached": True, "run_id": run_id or result.run_id})


_PACKET_KEYS = ("fee", "risk", "liquidity", "alpha")


def recorded_hashes(result: dict) -> dict:
    """The four packet hashes a recorded run saw (tradeContext of its result). Empty values when it recorded none."""
    tc = (result or {}).get("tradeContext") or {}
    return {k: tc.get(f"{k}_packet_hash") for k in _PACKET_KEYS}


async def current_demo_hashes(account_id: str, symbol: str) -> Optional[dict]:
    """Hashes of the packets built from the demo account's CURRENT data; None when they cannot be built or there is
    no trade (then nothing recorded can be shown to describe this data)."""
    from agents.council import load_packets

    try:
        (fee, risk, liquidity, alpha), _ = await load_packets(account_id, symbol)
    except Exception as exc:
        print(f"[demo] current packets unavailable: {type(exc).__name__}")
        return None
    if fee.trade_count == 0:
        return None
    return {"fee": fee.content_hash, "risk": risk.content_hash, "liquidity": liquidity.content_hash, "alpha": alpha.content_hash}


def load_demo_fixture(account_id: str, symbol: str, directory: pathlib.Path | None = None,
                      hashes: Optional[dict] = None) -> Optional[CouncilResult]:
    """The committed fixture, only when its recorded packet hashes equal `hashes` (the current data's)."""
    path = (directory or DEMO_RUNS_DIR) / f"{account_id}.json"
    if account_id not in VALID_DEMO_USERS or not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("symbol") != symbol:
        return None
    if hashes is not None and recorded_hashes(data["council_result"]) != hashes:
        return None
    return _as_cached(data["council_result"], data["council_result"].get("run_id"), demo=True)


async def serve_demo_run(account_id: str, symbol: str) -> CouncilResult:
    """Newest non-degraded stored run of a demo account, else its committed fixture, else DEMO_NOT_GENERATED. Never a
    live run. A recorded run is served only if its packet hashes equal those of the packets built from the account's
    current data: a run that describes earlier (replaced) demo trades is not shown as if it described these."""
    from agents import persistence

    hashes = await current_demo_hashes(account_id, symbol)
    if hashes is None:
        raise CouncilError(DEMO_NOT_GENERATED)
    result = None
    try:
        doc = await persistence.latest_demo_run(account_id, symbol, hashes)
        if doc and doc.get("council_result"):
            result = _as_cached(doc["council_result"], doc.get("run_id"), demo=True)
    except Exception as exc:  # database down: the committed fixture still works
        print(f"[demo] stored-run lookup failed: {type(exc).__name__}")
    if result is None:
        result = load_demo_fixture(account_id, symbol, hashes=hashes)
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

    (fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt), trades = await load_packets(account_id, symbol)
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
        llm=llm, on_event=on_event, trades=trades,
    )
