"""Agent Council pipeline tests. Providers are faked behind the real router (tests/council_fakes.py),
so no real API calls are made."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from agents.schemas import CouncilResult
from tests.council_fakes import HTTPError, make_packets, make_router


def _run(router, persist=False, **kw):
    from agents.council import run_council_pipeline

    fee, risk, liq, alpha = make_packets()
    return asyncio.run(run_council_pipeline("demo-disciplined", "demo-disciplined", "BTCUSDT",
                                            fee, risk, liq, alpha, llm=router, persist=persist, **kw))


# Test A — valid CouncilResult for a well-formed request
def test_council_returns_valid_result() -> None:
    router, provider = make_router()
    result = _run(router)

    assert isinstance(result, CouncilResult)
    assert result.tradeContext.userId == "demo-disciplined"
    assert result.liquidity.liquidityRating == "GOOD"
    assert result.alpha.alphaRating == "NEUTRAL"
    assert result.risk.riskLevel == "LOW"
    assert result.fee.feeRating == "OPTIMAL"
    assert result.synthesis.overallRating == "GOOD"
    assert result.totalLatencyMs >= 0
    assert len(result.synthesis.topRecommendations) == 3
    # 4 specialists + 2 rounds x 2 debate turns + 1 synthesis = 9 calls, all answered
    assert (result.n_calls_expected, result.n_calls_ok, result.degraded) == (9, 9, False)
    assert len(provider.calls) == 9


# Test B — specialist failure → default verdict with confidence=0, and the run is degraded
def test_specialist_failure_produces_default_verdict() -> None:
    router, provider = make_router({"liquidity_scout": TimeoutError("Simulated timeout")})
    result = _run(router)

    assert result.liquidity.confidence == 0.0
    assert "agent_failed" in result.liquidity.flags
    assert result.alpha.llm_self_confidence > 0
    assert result.risk.llm_self_confidence > 0
    assert result.fee.llm_self_confidence > 0
    assert result.degraded is True
    assert result.synthesis.overallRating is None


# Test C — synthesis receives all four verdicts
def test_synthesis_receives_all_verdicts() -> None:
    router, provider = make_router()
    _run(router)
    synth_user = next(c["messages"][1]["content"] for c in provider.calls if c["agent"] == "synthesis")
    for agent in ("liquidity_scout", "alpha_architect", "risk_auditor", "fee_optimizer"):
        assert agent in synth_user


# Test D — /health reports the first routed model per role
@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    from httpx import ASGITransport, AsyncClient

    from agents.llm_router import load_routes
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    cfg = load_routes()
    labels = {f"{m.provider}/{m.model}" for m in cfg.models.values()}
    assert body["models"]["specialists"] in labels
    assert body["models"]["synthesis"] in labels
