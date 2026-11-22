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
from agents.cited_values import safe_trace
from agents.render import packet_ctx
from agents.schemas import CouncilResult
from config.demo_users import VALID_DEMO_USERS

DEMO_RUNS_DIR = pathlib.Path(__file__).resolve().parents[1] / "demo_runs"


def _router():
    from agents import llm_router

    return llm_router.get_default_router()


async def _replay(result: CouncilResult, on_event: EventSink, ctx: Optional[dict] = None) -> None:
    """The events of a stored result. With the packet context of the data the run describes, a `cited_values` event
    (agents.cited_values) comes just before `complete`: computed on read, beside the recorded result, which stays
    unchanged (`complete` stays equal to the HTTP body)."""
    if on_event is None:
        return
    for name, data in result_events(result):
        if name == "complete" and ctx is not None:
            await on_event("cited_values", {"citedValues": safe_trace(data, ctx)})
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


def fails_current_claim_rules(doc_result: dict) -> bool:
    """True when the run's copy holds a causal phrasing or a number-free judgement of claim rules 1.2.0. A demo run
    recorded before 1.2.0 that does is not served until it is re-recorded (its text is never edited)."""
    from agents.claims import new_rule_hits

    return bool(new_rule_hits(doc_result))


def _as_cached(doc_result: dict, run_id: Optional[str], demo: bool = False) -> Optional[CouncilResult]:
    result = CouncilResult.model_validate(doc_result)
    if result.degraded or (demo and (states_a_cause(doc_result) or fails_current_claim_rules(doc_result))):
        return None
    return result.model_copy(update={"cached": True, "run_id": run_id or result.run_id})


_PACKET_KEYS = ("fee", "risk", "liquidity", "alpha")


def recorded_hashes(result: dict) -> dict:
    """The four packet hashes a recorded run saw (tradeContext of its result). Empty values when it recorded none."""
    tc = (result or {}).get("tradeContext") or {}
    return {k: tc.get(f"{k}_packet_hash") for k in _PACKET_KEYS}


async def current_demo_inputs(account_id: str, symbol: str) -> Optional[tuple[dict, dict]]:
    """(hashes, packet context) of the packets built from the demo account's CURRENT data; None when they cannot be
    built or there is no trade (then nothing recorded can be shown to describe this data)."""
    from agents.council import load_packets

    try:
        (fee, risk, liquidity, alpha), trades = await load_packets(account_id, symbol)
    except Exception as exc:
        print(f"[demo] current packets unavailable: {type(exc).__name__}")
        return None
    if fee.trade_count == 0:
        return None
    hashes = {"fee": fee.content_hash, "risk": risk.content_hash, "liquidity": liquidity.content_hash, "alpha": alpha.content_hash}
    return hashes, packet_ctx(fee, risk, liquidity, alpha, trades)


async def current_demo_hashes(account_id: str, symbol: str) -> Optional[dict]:
    """Hashes of the packets built from the demo account's CURRENT data (see current_demo_inputs)."""
    inputs = await current_demo_inputs(account_id, symbol)
    return inputs[0] if inputs else None


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


async def serve_demo_run(account_id: str, symbol: str, hashes: Optional[dict] = None) -> CouncilResult:
    """Newest non-degraded stored run of a demo account, else its committed fixture, else DEMO_NOT_GENERATED. Never a
    live run. A recorded run is served only if its packet hashes equal those of the packets built from the account's
    current data: a run that describes earlier (replaced) demo trades is not shown as if it described these."""
    from agents import persistence

    hashes = hashes if hashes is not None else await current_demo_hashes(account_id, symbol)
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


MODES = ("quick", "deep")
SCOPE_TIMEOUT_S = 5.0


async def emit_scope(on_event: EventSink, account_id: str, symbol: str) -> None:
    """The `scope` event: which symbol the audit covers and how many fills that is of the account's (both counts
    from the database, sent first). A count that cannot be read sends no event, so the page states no number."""
    if on_event is None:
        return
    import asyncio

    from agents.metrics import loader

    try:
        counts = await asyncio.wait_for(loader.scope_counts(account_id, symbol), SCOPE_TIMEOUT_S)
    except Exception as exc:   # class name only: the text of a database error can hold a connection string
        print(f"[council] scope counts unavailable: {type(exc).__name__}")
        return
    await on_event("scope", {"scope": {"symbol": symbol, **counts}})


async def _replay_quick(result: dict, on_event: EventSink) -> None:
    """The events a client needs to render a Quick result: its synthesis, the gate, and the whole result."""
    if on_event is None:
        return
    from agents.council import synthesis_event
    from agents.schemas import SynthesisOutput

    synth = SynthesisOutput.model_validate(result["synthesis"])
    await on_event("synthesis_done", synthesis_event(synth, result["degraded"], result.get("degraded_reasons", [])))
    await on_event("gate_done", {"verification": result["verification"], "grounding": result["grounding"], "claims": result["claims"]})
    await on_event("complete", result)


async def _run_quick(account_id, symbol, packets, hashes, trades, llm, on_event) -> dict:
    """One model call through the same grounding, verification and claim check as a Council run (agents.single_call), stored
    in council_runs with `mode: "quick"` so that the content-hash cache can serve it again."""
    from agents import persistence
    from agents.single_call import run_single_call
    from config.versions import METRICS_VERSION, SINGLE_PROMPT_VERSION

    fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = packets
    out = await run_single_call(account_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, llm, trades)
    out.update({"mode": "quick", "cached": False, "metrics_version": METRICS_VERSION, "n_calls_expected": 1,
                "degraded_reasons": out.get("degraded_reasons", []), "run_id": None})
    try:
        out["run_id"] = await persistence.save_council_run(
            account_id=account_id, user_id=account_id, symbol=symbol, council_result_dict=out, grounding=out["grounding"],
            packet_hashes=hashes, model_usage=out.get("modelUsage", {}), total_latency_ms=out["totalLatencyMs"],
            prompt_version=SINGLE_PROMPT_VERSION, verification=out["verification"],
            extra={"mode": "quick", "degraded": out["degraded"], "degraded_reasons": out["degraded_reasons"],
                   "n_calls_expected": 1, "n_calls_ok": out["n_calls_ok"], "metrics_version": METRICS_VERSION,
                   "claim_rules_version": out.get("claim_rules_version"), "route_config_hash": out.get("route_config_hash"),
                   "trace_id": out.get("trace_id"), "llm_calls": out.get("llm_calls", [])})
    except Exception as exc:        # a failed save never hides a finished audit; it only means no cache entry
        print(f"[quick] save failed type={type(exc).__name__}")
    await _replay_quick(out, on_event)
    return out


async def council_flow(account_id: str, symbol: str, on_event: EventSink = None, llm=None, mode: str = "deep"):
    """One audit of an account's past executions. mode "deep" is the 9-call Council (returns a CouncilResult); "quick" is the
    single-call audit (returns a dict with mode "quick"). Both read the same packets, use the same content-hash cache (a
    run of one mode never serves the other), and draw on the same budget: Deep costs 9 units, Quick 1 (config.budget).
    A demo account is never run live in either mode: its stored Council run is served."""
    from agents import persistence
    from config.budget import DEEP_UNITS, QUICK_UNITS, council_budget
    from config.versions import METRICS_VERSION, PROMPT_VERSION, SINGLE_PROMPT_VERSION

    if mode not in MODES:
        raise ValueError(f"unknown audit mode {mode!r}; expected one of {MODES}")
    await emit_scope(on_event, account_id, symbol)
    if account_id in VALID_DEMO_USERS:
        inputs = await current_demo_inputs(account_id, symbol)
        if inputs is None:
            raise CouncilError(DEMO_NOT_GENERATED)
        result = await serve_demo_run(account_id, symbol, hashes=inputs[0])
        await _replay(result, on_event, ctx=inputs[1])   # the served run's hashes equal these packets'
        return result

    packets, trades = await load_packets(account_id, symbol)
    fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = packets
    if fee_pkt.trade_count == 0:
        raise CouncilError(NO_DATA)

    llm = llm or _router()
    hashes = {
        "fee": fee_pkt.content_hash,
        "risk": risk_pkt.content_hash,
        "liquidity": liquidity_pkt.content_hash,
        "alpha": alpha_pkt.content_hash,
    }
    quick = mode == "quick"
    doc = await persistence.find_cached_run(
        account_id, symbol, hashes, SINGLE_PROMPT_VERSION if quick else PROMPT_VERSION, METRICS_VERSION, llm.config.hash,
        mode=mode,
    )
    if doc and doc.get("council_result"):
        if quick:
            cached = {**doc["council_result"], "cached": True, "run_id": doc.get("run_id")}
            if not cached.get("degraded"):
                await _replay_quick(cached, on_event)
                return cached
        else:
            cached = _as_cached(doc["council_result"], doc.get("run_id"))
            if cached is not None:
                await _replay(cached, on_event, ctx=packet_ctx(fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, trades))
                return cached

    # Checked before the per-account quota, so a refused run costs the user nothing.
    problem = await llm.capacity_problem()
    if problem == "no_provider":
        raise CouncilError(MODEL_UNAVAILABLE)
    if problem is not None:
        raise CouncilError(DAILY_BUDGET_EXHAUSTED)
    decision = council_budget.try_acquire(account_id, QUICK_UNITS if quick else DEEP_UNITS)
    if not decision.allowed:
        code = RATE_LIMIT_EXHAUSTED if decision.reason == "account" else DAILY_BUDGET_EXHAUSTED
        # A refused Deep audit says whether the cheaper Quick audit would still be allowed: never a silent failure.
        raise CouncilError(code, retry_after_s=decision.retry_after_s,
                           quick_available=None if quick else bool(council_budget.status(account_id)["quickAvailable"]))

    if quick:
        return await _run_quick(account_id, symbol, packets, hashes, trades, llm, on_event)
    return await run_council_pipeline(
        account_id, account_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
        llm=llm, on_event=on_event, trades=trades,
    )
