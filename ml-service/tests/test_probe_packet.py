"""The 1b.7 probe sends real prompts built from tests/fixtures/probe_packet.json. That file must be
exactly what the packet builders produce from the hand-computed trade fixtures in the packet tests
(no DB). There is no demo-aggressive packet fixture in the suite, so these are the ones used."""
import json
import pathlib

from agents.metrics.alpha_packet import build_alpha_packet
from agents.metrics.fee_packet import build_fee_packet
from agents.metrics.liquidity_packet import build_liquidity_packet
from agents.metrics.risk_packet import build_risk_packet
from tests import test_alpha_packet, test_fee_packet, test_liquidity_packet, test_risk_packet

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "probe_packet.json"


def build_probe_packet() -> dict:
    packets = {
        "fee": build_fee_packet(test_fee_packet.FIXTURE_BINANCE, "probe-user", "BTCUSDT"),
        "risk": build_risk_packet(test_risk_packet.FIXTURE_TRADES, "probe-user", "BTCUSDT"),
        "liquidity": build_liquidity_packet(test_liquidity_packet.FIXTURE_TRADES, "probe-user", "BTCUSDT"),
        "alpha": build_alpha_packet(test_alpha_packet.FIXTURE_TRADES, "probe-user", "BTCUSDT"),
    }
    return {
        "source": "hand-computed trade fixtures in tests/test_{fee,risk,liquidity,alpha}_packet.py",
        "symbol": "BTCUSDT",
        "packets": {k: p.to_prompt_dict() for k, p in packets.items()},
    }


def test_probe_packet_fixture_matches_the_packet_builders():
    assert json.loads(FIXTURE.read_text()) == build_probe_packet()


def test_probe_packet_has_no_identifiers():
    text = FIXTURE.read_text()
    assert "probe-user" not in text and "userId" not in text


if __name__ == "__main__":  # regenerate: python -m tests.test_probe_packet
    FIXTURE.write_text(json.dumps(build_probe_packet(), indent=2, sort_keys=True) + "\n")
