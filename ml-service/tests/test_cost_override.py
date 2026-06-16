import pytest
from agents.schemas import SynthesisOutput
from agents.metrics.fee_packet import FeeMetricsPacket

def test_synthesis_cost_override():
    # 1. Build a FeeMetricsPacket with total_fee_paid_usd = 328.00
    fee_pkt = FeeMetricsPacket(
        user_id="test_user",
        symbol="BTCUSDT",
        exchange="binance",
        computed_at="2026-06-15T00:00:00Z",
        total_fee_paid_usd=328.00
    )
    
    # 2. Build SynthesisOutput with fabricated value
    synthesis = SynthesisOutput(
        headline="Summary",
        narrative="Test narrative",
        topRecommendations=["Rec 1", "Rec 2", "Rec 3"],
        overallRating="GOOD",
        estimatedMonthlyCostUSD=2464.59
    )
    
    # 3. Override cost
    from agents.council import override_synthesis_cost
    synthesis_overridden = override_synthesis_cost(synthesis, fee_pkt)
    
    # 4. Assertions
    assert synthesis_overridden.estimatedMonthlyCostUSD == 328.00
    assert synthesis.estimatedMonthlyCostUSD == 2464.59  # original object unmutated
