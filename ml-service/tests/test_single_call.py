"""The single-call ablation arm: exactly one model call on the fake router (observations only, so no
re-reason), and the same pipeline stages as the Council ran on its answer."""
import asyncio
from unittest.mock import MagicMock, patch

from mongomock_motor import AsyncMongoMockClient

from agents.single_call import run_single_call
from tests.council_fakes import make_packets, make_router


def test_one_call_and_same_post_processing():
    router, _ = make_router()
    fee, risk, liq, alpha = make_packets(total_fee_paid_usd=328.0)
    out = asyncio.run(run_single_call("demo-moderate", "BTCUSDT", fee, risk, liq, alpha, router, []))
    assert out["n_calls_ok"] == 1 and out["n_attempts"] == 1          # 1 call, no re-reason (observations only)
    assert out["degraded"] is False and out["arm"] == "single_call"
    assert out["synthesis"]["overallRating"] == "GOOD"
    assert out["synthesis"]["estimatedMonthlyCostUSD"] == 328.0       # cost override ran, not the model's 33.0
    assert "numbers_checked" in out["grounding"] and "flagged_first_pass" in out["claims"]
    assert len(out["trace_id"]) == 32
