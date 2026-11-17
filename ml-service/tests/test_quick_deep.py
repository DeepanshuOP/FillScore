"""M3 §3 and §4: Quick audit (one call, the single-call arm) and Deep audit (the 9-call Council), one budget.

- Quick is one model call through the same grounding, verification and claim check; its result carries `mode: "quick"` and has no
  specialist verdicts or debate (it has none to show).
- Deep is the Council as before. A cached run of one mode is never served for the other.
- Quick costs 1 budget unit and Deep 9, from one allowance. A Deep run refused for budget says whether Quick is still allowed.
"""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from mongomock_motor import AsyncMongoMockClient

from agents.errors import CouncilError, DAILY_BUDGET_EXHAUSTED, RATE_LIMIT_EXHAUSTED
from config.budget import council_budget
from tests.council_fakes import SYNTHESIS, make_packets, make_router

USER = "acct-real-q"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    council_budget.reset()
    monkeypatch.setenv("COUNCIL_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "100")
    monkeypatch.delenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", raising=False)
    yield
    council_budget.reset()


def _flow(router, db, mode, packets=None, events=None, account=USER):
    from agents.council_service import council_flow
    packets = packets or make_packets()

    async def load(*_a, **_k):
        return packets, []

    async def sink(name, data):
        if events is not None:
            events.append((name, data))

    with patch("agents.council_service._router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), db)):
        return asyncio.run(council_flow(account, "BTCUSDT", on_event=sink, mode=mode))


def _db():
    return AsyncMongoMockClient()["fillscore"]


def test_quick_makes_one_call_and_returns_a_quick_result_without_specialists():
    router, provider = make_router()
    events: list = []
    out = _flow(router, _db(), "quick", events=events)
    assert len(provider.calls) == 1 and provider.calls[0]["agent"] == "synthesis"
    assert out["mode"] == "quick" and out["arm"] == "single_call" and out["cached"] is False
    assert out["n_calls_ok"] == 1 and out["degraded"] is False and out["synthesis"]["overallRating"] == "GOOD"
    for absent in ("liquidity", "alpha", "risk", "fee"):
        assert absent not in out
    assert not out.get("debate_transcript")                                 # the single-call result keeps an empty debate
    assert [n for n, _ in events] == ["synthesis_done", "gate_done", "complete"]
    assert events[-1][1]["mode"] == "quick" and events[-1][1]["run_id"] == out["run_id"]


def test_quick_is_persisted_with_its_mode_and_served_from_cache_next_time():
    router, provider = make_router()
    db = _db()
    first = _flow(router, db, "quick")
    assert first["run_id"]
    doc = asyncio.run(db["council_runs"].find_one({"run_id": first["run_id"]}))
    assert doc["mode"] == "quick" and doc["degraded"] is False and doc["packet_hashes"]["fee"]
    n = len(provider.calls)
    events: list = []
    again = _flow(router, db, "quick", events=events)
    assert len(provider.calls) == n and again["cached"] is True and again["run_id"] == first["run_id"]
    assert [x for x, _ in events] == ["synthesis_done", "gate_done", "complete"]


def test_a_cached_run_of_one_mode_is_never_served_for_the_other():
    router, provider = make_router()
    db = _db()
    _flow(router, db, "quick")
    deep = _flow(router, db, "deep")
    assert deep.cached is False and len(provider.calls) > 1 + 8          # the quick call, then a full Council
    n = len(provider.calls)
    assert _flow(router, db, "deep").cached is True and len(provider.calls) == n
    assert _flow(router, db, "quick")["cached"] is True and len(provider.calls) == n


def test_a_run_made_under_older_claim_rules_is_not_served_from_cache():
    """Review finding 3: a cached run is not re-checked, so one made under claim rules 1.0.0 (or with no stamp) may hold wording
    that 1.1.0 refuses. The cache key carries the claim rules version; an unstamped run counts as 1.0.0."""
    from tests.test_council_cache_demo import _stored_run
    router, provider = make_router()
    db = _db()
    for stamp in (None, "1.0.0"):
        doc = _stored_run(router, account=USER)
        doc.pop("claim_rules_version", None)
        if stamp:
            doc["claim_rules_version"] = stamp
        asyncio.run(db["council_runs"].insert_one(dict(doc, run_id=f"old-{stamp}")))
    out = _flow(router, db, "deep")
    assert out.cached is False and len(provider.calls) >= 9                  # both old runs were passed over: a live run
    from config.versions import CLAIM_RULES_VERSION
    n = len(provider.calls)
    assert _flow(router, db, "deep").cached is True and len(provider.calls) == n      # the new run carries the current stamp
    doc = asyncio.run(db["council_runs"].find_one({"run_id": out.run_id}))
    assert doc["claim_rules_version"] == CLAIM_RULES_VERSION


def test_a_degraded_quick_run_is_reported_degraded_ungraded_and_not_cached():
    router, provider = make_router({"synthesis": RuntimeError("model down")})
    db = _db()
    out = _flow(router, db, "quick")
    assert out["degraded"] is True and out["synthesis"]["overallRating"] is None and out["mode"] == "quick"
    n = len(provider.calls)
    _flow(router, db, "quick")
    assert len(provider.calls) > n                                        # tried again: a degraded run is not a cache hit


def test_an_unknown_mode_is_refused_not_guessed():
    router, _ = make_router()
    with pytest.raises(ValueError):
        _flow(router, _db(), "turbo")


def test_quick_costs_one_unit_and_deep_nine_from_one_allowance(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")               # one Deep run = 9 units per hour
    router, _ = make_router()
    db = _db()
    for i in range(9):                                                     # nine different packets: no cache hit
        out = _flow(router, db, "quick", packets=make_packets(total_fee_paid_usd=100.0 + i))
        assert out["mode"] == "quick"
    with pytest.raises(CouncilError) as info:
        _flow(router, db, "quick", packets=make_packets(total_fee_paid_usd=999.0))
    assert info.value.code == RATE_LIMIT_EXHAUSTED


def test_a_refused_deep_run_says_quick_is_still_available(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    router, _ = make_router()
    db = _db()
    for i in range(3):
        _flow(router, db, "quick", packets=make_packets(total_fee_paid_usd=100.0 + i))     # 3 of 9 units used
    with pytest.raises(CouncilError) as info:
        _flow(router, db, "deep", packets=make_packets(total_fee_paid_usd=500.0))
    assert info.value.code == RATE_LIMIT_EXHAUSTED and info.value.quick_available is True and info.value.retry_after_s


def test_a_refused_deep_run_says_when_quick_is_not_available_either(monkeypatch):
    monkeypatch.setenv("COUNCIL_DAILY_RUN_CAP", "1")
    router, _ = make_router()
    db = _db()
    for i in range(9):
        _flow(router, db, "quick", packets=make_packets(total_fee_paid_usd=100.0 + i))     # the day's 9 units are gone
    with pytest.raises(CouncilError) as info:
        _flow(router, db, "deep", packets=make_packets(total_fee_paid_usd=500.0))
    assert info.value.code == DAILY_BUDGET_EXHAUSTED and info.value.quick_available is False


def test_a_cache_hit_costs_no_units(monkeypatch):
    monkeypatch.setenv("COUNCIL_ACCOUNT_RUNS_PER_HOUR", "1")
    router, _ = make_router()
    db = _db()
    _flow(router, db, "quick")                                             # 1 of 9 units
    for _ in range(20):
        assert _flow(router, db, "quick")["cached"] is True
    assert council_budget.status(USER)["account"]["unitsLeft"] == 8


def test_demo_accounts_ignore_the_mode_and_never_run_live():
    router, provider = make_router()
    with pytest.raises(CouncilError):                                       # nothing recorded for the stub data: not generated
        _flow(router, _db(), "quick", account="demo-moderate")
    assert provider.calls == []
