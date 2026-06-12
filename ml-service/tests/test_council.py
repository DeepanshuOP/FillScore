"""Tests for the Agent Council — written FIRST (TDD RED phase).

Mocks the Anthropic client so no real API calls are made.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from agents.schemas import (
    AlphaVerdict,
    CouncilResult,
    FeeVerdict,
    LiquidityVerdict,
    RiskVerdict,
    SynthesisOutput,
    TradeContext,
)
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.alpha_packet import AlphaMetricsPacket


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MOCK_LIQUIDITY_JSON = json.dumps(
    {
        "agent": "liquidity_scout",
        "liquidityRating": "GOOD",
        "slippageRoot": "Normal spread conditions",
        "cited_evidence": ["avg_slippage_bps"],
        "severity": "LOW",
        "confidence": 0.85,
        "flags": [],
    }
)

MOCK_ALPHA_JSON = json.dumps(
    {
        "agent": "alpha_architect",
        "alphaRating": "NEUTRAL",
        "bestAlternative": "Use TWAP over 5-minute windows",
        "cited_evidence": ["avg_vwap_deviation_bps"],
        "severity": "LOW",
        "confidence": 0.78,
        "flags": [],
    }
)

MOCK_RISK_JSON = json.dumps(
    {
        "agent": "risk_auditor",
        "riskLevel": "LOW",
        "cited_evidence": ["adverseSelectionRisk", "concentrationScore"],
        "severity": "LOW",
        "confidence": 0.90,
        "flags": [],
    }
)

MOCK_FEE_JSON = json.dumps(
    {
        "agent": "fee_optimizer",
        "feeRating": "OPTIMAL",
        "recommendedAction": "Maintain current maker ratio",
        "cited_evidence": ["maker_ratio"],
        "severity": "LOW",
        "confidence": 0.92,
        "flags": [],
    }
)

MOCK_SYNTHESIS_JSON = json.dumps(
    {
        "headline": "Execution quality is solid with room for marginal gains",
        "narrative": (
            "Your trading shows good liquidity access. "
            "Slippage is within normal range for BTCUSDT. "
            "Maker ratio is efficient, capturing rebates effectively. "
            "Consider TWAP for larger orders to further reduce impact."
        ),
        "topRecommendations": [
            "Maintain maker ratio above 0.60 to preserve fee efficiency",
            "Use TWAP execution for trades exceeding $10,000 notional",
            "Avoid hour 03 UTC which shows worst execution quality",
        ],
        "conflictLedger": [],
        "overallRating": "GOOD",
        "estimatedMonthlyCostUSD": 33.0,
    }
)


def _make_mock_response(content_text: str) -> MagicMock:
    """Build a mock OpenAI ChatCompletion response."""
    choice = MagicMock()
    choice.message = MagicMock()
    choice.message.content = content_text

    response = MagicMock()
    response.choices = [choice]
    return response


def _make_mock_client(response_text: str) -> AsyncMock:
    """Build a mock AsyncOpenAI client returning the given JSON."""
    client = AsyncMock()
    client.chat = AsyncMock()
    client.chat.completions = AsyncMock()
    client.chat.completions.create = AsyncMock(return_value=_make_mock_response(response_text))
    return client


# ---------------------------------------------------------------------------
# Test A — valid CouncilResult for a well-formed request
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_council_returns_valid_result() -> None:
    """A well-formed request produces a valid CouncilResult."""
    from agents.council import run_council

    call_count = 0

    async def _route_create(**kwargs: object) -> MagicMock:
        nonlocal call_count
        call_count += 1
        model = kwargs.get("model", "")
        if "llama" in str(model) or "deepseek" in str(model) or "gpt-oss-120b" in str(model):
            # Determine which agent by inspecting the system prompt
            messages = kwargs.get("messages", [])
            system = str(messages[0].get("content", "")) if messages else ""
            if "judge" in system.lower() or "synthesis" in system.lower():
                return _make_mock_response(MOCK_SYNTHESIS_JSON)
            elif "liquidity" in system.lower():
                return _make_mock_response(MOCK_LIQUIDITY_JSON)
            elif "alpha" in system.lower():
                return _make_mock_response(MOCK_ALPHA_JSON)
            elif "risk" in system.lower():
                return _make_mock_response(MOCK_RISK_JSON)
            elif "fee" in system.lower():
                return _make_mock_response(MOCK_FEE_JSON)
        # Fallback
        return _make_mock_response(MOCK_SYNTHESIS_JSON)

    mock_client = AsyncMock()
    mock_client.chat = AsyncMock()
    mock_client.chat.completions = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=_route_create)
    
    dummy_fee = FeeMetricsPacket("u", "s", "binance", "now")
    dummy_risk = RiskMetricsPacket("u", "s", "now")
    dummy_liq = LiquidityMetricsPacket("u", "s", "now")
    dummy_alpha = AlphaMetricsPacket("u", "s", "now")

    with patch("agents.llm_client.get_groq_client", return_value=mock_client), \
         patch("agents.llm_client.get_openrouter_client", return_value=mock_client), \
         patch("agents.council.load_all_packets", return_value=(dummy_fee, dummy_risk, dummy_liq, dummy_alpha)):
        result = await run_council("demo-disciplined", "BTCUSDT")

    assert isinstance(result, CouncilResult)
    assert result.tradeContext.userId == "demo-disciplined"
    assert result.liquidity.liquidityRating == "GOOD"
    assert result.alpha.alphaRating == "NEUTRAL"
    assert result.risk.riskLevel == "LOW"
    assert result.fee.feeRating == "OPTIMAL"
    assert result.synthesis.overallRating == "GOOD"
    assert result.totalLatencyMs >= 0
    assert len(result.synthesis.topRecommendations) == 3


# ---------------------------------------------------------------------------
# Test B — specialist agent failure → default verdict with confidence=0
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_specialist_failure_produces_default_verdict() -> None:
    """When a specialist agent fails, a default verdict with confidence=0 is used."""
    from agents.council import run_council

    async def _route_create(**kwargs: object) -> MagicMock:
        model = str(kwargs.get("model", ""))
        messages = kwargs.get("messages", [])
        system = str(messages[0].get("content", "")) if messages else ""
        if "llama" in model:
            if "liquidity" in system.lower():
                raise TimeoutError("Simulated timeout")
            elif "alpha" in system.lower():
                return _make_mock_response(MOCK_ALPHA_JSON)
            elif "risk" in system.lower():
                return _make_mock_response(MOCK_RISK_JSON)
            elif "fee" in system.lower():
                return _make_mock_response(MOCK_FEE_JSON)
        return _make_mock_response(MOCK_SYNTHESIS_JSON)

    mock_client = AsyncMock()
    mock_client.chat = AsyncMock()
    mock_client.chat.completions = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=_route_create)

    dummy_fee = FeeMetricsPacket("u", "s", "binance", "now")
    dummy_risk = RiskMetricsPacket("u", "s", "now")
    dummy_liq = LiquidityMetricsPacket("u", "s", "now")
    dummy_alpha = AlphaMetricsPacket("u", "s", "now")

    with patch("agents.llm_client.get_groq_client", return_value=mock_client), \
         patch("agents.llm_client.get_openrouter_client", return_value=mock_client), \
         patch("agents.council.load_all_packets", return_value=(dummy_fee, dummy_risk, dummy_liq, dummy_alpha)):
        result = await run_council("demo-disciplined", "BTCUSDT")

    assert isinstance(result, CouncilResult)
    # The failed liquidity agent should have confidence=0 and an agent_failed flag
    assert result.liquidity.confidence == 0.0
    assert "agent_failed" in result.liquidity.flags
    # Other agents should be fine
    assert result.alpha.llm_self_confidence > 0
    assert result.risk.llm_self_confidence > 0
    assert result.fee.llm_self_confidence > 0


# ---------------------------------------------------------------------------
# Test C — synthesis receives all four verdicts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_synthesis_receives_all_verdicts() -> None:
    """The synthesis agent receives all four specialist verdicts in its input."""
    from agents.council import run_council

    captured_synthesis_input: str | None = None

    async def _route_create(**kwargs: object) -> MagicMock:
        nonlocal captured_synthesis_input
        model = str(kwargs.get("model", ""))
        messages = kwargs.get("messages", [])
        system = str(messages[0].get("content", "")) if messages else ""
        if "llama" in model or "deepseek" in model or "gpt-oss-120b" in model:
            if "judge" in system.lower() or "synthesis" in system.lower():
                # Synthesis call  capture the user message
                if len(messages) > 1:
                    captured_synthesis_input = str(messages[1].get("content", ""))
                return _make_mock_response(MOCK_SYNTHESIS_JSON)
            elif "liquidity" in system.lower():
                return _make_mock_response(MOCK_LIQUIDITY_JSON)
            elif "alpha" in system.lower():
                return _make_mock_response(MOCK_ALPHA_JSON)
            elif "risk" in system.lower():
                return _make_mock_response(MOCK_RISK_JSON)
            elif "fee" in system.lower():
                return _make_mock_response(MOCK_FEE_JSON)

    mock_client = AsyncMock()
    mock_client.chat = AsyncMock()
    mock_client.chat.completions = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(side_effect=_route_create)

    dummy_fee = FeeMetricsPacket("u", "s", "binance", "now")
    dummy_risk = RiskMetricsPacket("u", "s", "now")
    dummy_liq = LiquidityMetricsPacket("u", "s", "now")
    dummy_alpha = AlphaMetricsPacket("u", "s", "now")

    with patch("agents.llm_client.get_groq_client", return_value=mock_client), \
         patch("agents.llm_client.get_openrouter_client", return_value=mock_client), \
         patch("agents.council.load_all_packets", return_value=(dummy_fee, dummy_risk, dummy_liq, dummy_alpha)):
        result = await run_council("demo-disciplined", "BTCUSDT")

    assert captured_synthesis_input is not None
    assert "liquidity_scout" in captured_synthesis_input
    assert "alpha_architect" in captured_synthesis_input
    assert "risk_auditor" in captured_synthesis_input
    assert "fee_optimizer" in captured_synthesis_input


# ---------------------------------------------------------------------------
# Test D — /health endpoint returns 200
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    """GET /health returns 200 with expected model info."""
    from httpx import ASGITransport, AsyncClient

    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "llama-3.3-70b-versatile" in body["models"]["specialists"]
    assert "llama-3.3-70b-versatile" in body["models"]["synthesis"]
