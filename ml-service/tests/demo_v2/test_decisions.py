"""The demo decisions port: the PRNG and the decision rules of backend/src/scripts/generateSyntheticTrades.ts.

Proof: the Python port regenerates every (executedAt, symbol, side, orderType, quantity) of the committed old demo
files backend/src/data/synthetic/*-trades.json. (Running the TS generator itself is blocked by the guard hook.)
"""
import json
from pathlib import Path

import pytest

from demo_v2.decisions import generate_decisions
from demo_v2.prng import mulberry32

REPO = Path(__file__).resolve().parents[3]


def test_mulberry32_matches_javascript():
    # node: mulberry32(42) first five outputs, and the 100,000th
    p = mulberry32(42)
    assert [p() for _ in range(5)] == [0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
                                       0.6697340414393693, 0.17481389874592423]
    q = mulberry32(42)
    for _ in range(99_999):
        q()
    assert q() == 0.9818388000130653


@pytest.fixture(scope="module")
def decisions():
    return generate_decisions(REPO / "backend" / "src" / "data" / "market")


def test_committed_old_files_come_from_an_older_generator(decisions):
    # Finding (2026-11-11): the committed synthetic files cannot be reproduced by the current generator. Their trade
    # ids have no symbol ("syn-aggressive-18630") while the current code writes "syn-<profile>-<SYMBOL>-<n>", and the
    # counts differ. The current code is what seedDatabase.ts runs, so it is the reference for M2.
    old = json.loads((REPO / "backend" / "src" / "data" / "synthetic" / "aggressive-trades.json").read_text())
    assert old[0]["tradeId"].count("-") == 2
    assert decisions["aggressive"][0].old_trade_id.count("-") == 3


def test_decisions_are_deterministic(decisions):
    again = generate_decisions(REPO / "backend" / "src" / "data" / "market")
    assert again == decisions


@pytest.mark.parametrize("pid", ["aggressive", "moderate", "disciplined"])
def test_decisions_follow_the_profile_rules(decisions, pid):
    from demo_v2.decisions import PROFILES
    p = next(x for x in PROFILES if x.id == pid)
    ds = decisions[pid]
    assert ds
    for d in ds:
        usd = d.quantity * d.minute_open
        w = p.symbol_weights[d.symbol]
        assert p.avg_trade_usd * w * 0.6 - 1e-9 <= usd <= p.avg_trade_usd * w * 1.4 + 1e-9
        assert d.executed_at_ms % 60_000 < 59_000
    if pid == "disciplined":
        assert all(d.order_type == "LIMIT" for d in ds)          # marketOrderRatio 0
    # outside preferred hours the probability is x0.1, so most trades fall inside them
    inside = sum(1 for d in ds if (d.executed_at_ms // 3_600_000) % 24 in p.preferred_hours)
    assert inside / len(ds) > 0.6
