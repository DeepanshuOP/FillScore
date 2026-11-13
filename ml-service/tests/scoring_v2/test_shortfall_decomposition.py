"""Scoring v2.3.0: the implementation-shortfall decomposition (ADR-0014).

Three scored components named after the shortfall terms, equal weights 1/3 each:
  execution    spread paid + impact/timing, order unit: the mean of the order's spread score (notional-weighted over its
               fills) and its impact score (anchors by duration); the one that exists if only one does.
  fees         fee paid vs the account's best available rate (unchanged from v2.0.0).
  opportunity  the unfilled part of an order. Unit score = fill_ratio x 100 + (1 - fill_ratio) x S, where S maps the
               signed mid drift over the order's life, per unit of unfilled quantity (opportunityBps / (1 - fill_ratio)),
               through the same duration anchors as the impact score. Weight: intended notional.
Timing is reported as information only (never scored).

Hand values, fixture of test_score.py (N one-fill orders on XUSDT: spread score 75.0049995, impact score 57.5, fee score
66.66666667, all fully filled, intended notional 100.02):
  execution unit = (75.0049995 + 57.5) / 2 = 66.25249975
  opportunity    = 100 (fully filled)
  composite      = (66.25249975 + 66.66666667 + 100) / 3 = 77.63972214 -> B
One extra order with no fill: intended notional 100.0, fill ratio 0, opportunity 4.0 bps over 30 s (anchors 10s-1m
(-2, 0, 4, 10): 4 is the 90th percentile -> S = 40), so its unit score is 0 x 100 + 1 x 40 = 40.
  opportunity = (20 x 100.02 x 100 + 100.0 x 40) / (20 x 100.02 + 100.0) = 204040 / 2100.4 = 97.14340...
"""
from datetime import datetime, timezone

import pytest

from scoring_v2.aggregate import score_account
from scoring_v2.components import execution_unit_score, opportunity_unit_score
from scoring_v2.score import score_account_v2
from tests.scoring_v2.test_score import ACC, B, SNAP, VERSION as V0, make_db

ANCH = (-10.0, 0.0, 10.0, 30.0)       # 100, 75, 40, 0 points


def test_opportunity_unit_score_hand_values():
    assert opportunity_unit_score(0.0, 10.0, ANCH) == pytest.approx(40.0)            # whole order unfilled, drift at the 90th pct
    assert opportunity_unit_score(0.5, 5.0, ANCH) == pytest.approx(70.0)             # half filled; 5 bps of notional = 10 bps on the unfilled half: 50 + 0.5 x 40
    assert opportunity_unit_score(1.0, 0.0, ANCH) == 100.0                           # nothing unfilled
    assert opportunity_unit_score(1.0, None, None) == 100.0                          # fully filled needs no anchors or end mid
    assert opportunity_unit_score(0.0, -10.0, ANCH) == pytest.approx(100.0)          # the unfilled part moved in the trader's favour
    assert opportunity_unit_score(0.0, 30.0, ANCH) == pytest.approx(0.0)


def test_opportunity_unit_score_not_measured():
    assert opportunity_unit_score(0.0, None, ANCH) is None                           # no end mid
    assert opportunity_unit_score(0.0, 4.0, None) is None                            # no anchors for this symbol or duration
    with pytest.raises(ValueError):
        opportunity_unit_score(1.2, 0.0, ANCH)                                       # a fill ratio is within 0..1
    with pytest.raises(ValueError):
        opportunity_unit_score(-0.1, 0.0, ANCH)


def test_execution_unit_score_is_the_mean_of_the_parts_that_exist():
    assert execution_unit_score(80.0, 60.0) == 70.0
    assert execution_unit_score(80.0, None) == 80.0
    assert execution_unit_score(None, 60.0) == 60.0
    assert execution_unit_score(None, None) is None


# ── aggregation with the shortfall spec ──────────────────────────────────────

SPEC = {"weights": {"execution": 1 / 3, "fees": 1 / 3, "unfilled": 1 / 3}, "order": ("execution", "unfilled"), "fill": ("fees",)}


def _orders(n_a=1, n_b=1):
    # A: notional 100, execution 80, opportunity 100, one fill (100, fees 90). B: notional 300, execution 40, opportunity 60, fill (300, fees 70).
    a = {"orderId": "A", "notional": 100.0, "execution": 80.0, "unfilled": 100.0, "fills": [{"notional": 100.0, "fees": 90.0}]}
    b = {"orderId": "B", "notional": 300.0, "execution": 40.0, "unfilled": 60.0, "fills": [{"notional": 300.0, "fees": 70.0}]}
    return [dict(a, orderId=f"A{i}") for i in range(n_a)] + [dict(b, orderId=f"B{i}") for i in range(n_b)]


def test_aggregate_hand_values():
    # execution (80 x 100 + 40 x 300) / 400 = 50; fees (90 x 100 + 70 x 300) / 400 = 75; opportunity (100 x 100 + 60 x 300) / 400 = 70
    r = score_account(_orders(), SPEC)
    c = r["components"]
    assert c["execution"]["score"] == pytest.approx(50.0) and c["fees"]["score"] == pytest.approx(75.0)
    assert c["unfilled"]["score"] == pytest.approx(70.0)
    assert r["composite"] == pytest.approx(65.0)                                     # (50 + 75 + 70) / 3
    assert r["grade"] is None and r["reason"] == "fewer than 20 measured fills"      # 2 fills: a band, never a letter
    assert set(c) == {"execution", "fees", "unfilled"}


def test_aggregate_letter_with_enough_units():
    r = score_account(_orders(10, 10), SPEC)                                         # 20 orders, 20 fills; same weighted means
    assert r["composite"] == pytest.approx(65.0) and r["grade"] == "C"
    assert r["components"]["unfilled"]["measured"] == 20 and r["components"]["execution"]["measured"] == 20


def test_an_unmeasured_component_blocks_the_composite():
    orders = _orders(10, 10)
    for o in orders:
        o["unfilled"] = None
    r = score_account(orders, SPEC)
    assert r["components"]["unfilled"]["score"] is None and r["composite"] is None and r["grade"] is None
    assert r["reason"] == "insufficient data"


def test_default_spec_is_unchanged_v2_behaviour():
    from scoring_v2.components import WEIGHTS
    assert set(WEIGHTS) == {"slippage", "fees", "timing", "spread"}


# ── the scorer ───────────────────────────────────────────────────────────────

V3 = {**V0, "id": "v2.3.0", "decomposition": "implementation_shortfall",
      "weights": {"execution": 1 / 3, "fees": 1 / 3, "unfilled": 1 / 3},
      "timingFloorBps": {"XUSDT": 0.5}, "timingReferenceHours": 3}


def _db(n=20, unfilled=False):
    db = make_db(n)
    for om in db.order_measurements.find({}):
        sf = dict(om["shortfall"], intendedNotional=100.02, fillRatio=1.0, opportunityBps=0.0, feesBps=10.0, totalBps=13.0)
        db.order_measurements.update_one({"_id": om["_id"]}, {"$set": {"shortfall": sf, "endMs": om["arrivalMs"] + 30_000}})
    if unfilled:
        arrival = int(B.timestamp() * 1000) + 99 * 120_000
        db.order_measurements.insert_one({
            "accountId": ACC, "exchange": "binance", "symbol": "XUSDT", "orderId": "u1", "version": "1.0.0", "arrivalMs": arrival,
            "endMs": arrival + 30_000, "marketDataRefs": [{"sha256": "ef"}], "measuredAt": datetime(2026, 10, 3), "unmeasuredReason": None,
            "shortfall": {"basis": "order", "intendedNotional": 100.0, "fillRatio": 0.0, "opportunityBps": 4.0, "executionBps": 0.0,
                          "feesBps": 0.0, "totalBps": 4.0, "impactTimingBps": None}})
    return db


def test_scorer_hand_case_fully_filled():
    r = score_account_v2(_db(20), ACC, V3, "ff" * 32, now_ms=0)["result"]
    c = r["components"]
    assert c["execution"]["score"] == pytest.approx(66.25249975, abs=1e-6)
    assert c["fees"]["score"] == pytest.approx(66.66666667, abs=1e-6)
    assert c["unfilled"]["score"] == pytest.approx(100.0)
    assert r["composite"] == pytest.approx(77.63972214, abs=1e-6) and r["grade"] == "B"
    assert set(c) == {"execution", "fees", "unfilled"}


def test_scorer_counts_an_order_with_no_fill():
    r = score_account_v2(_db(20, unfilled=True), ACC, V3, "ff" * 32, now_ms=0)["result"]
    assert r["orders"] == 21 and r["fills"] == 20
    assert r["components"]["unfilled"]["score"] == pytest.approx(204040 / 2100.4, abs=1e-4)
    assert r["components"]["unfilled"]["measured"] == 21
    assert r["components"]["execution"]["score"] == pytest.approx(66.25249975, abs=1e-6)      # the unfilled order has no execution unit


def test_timing_is_information_only():
    # hour profile index h + 1; hour 14 -> 15; the 3 cheapest hours (1, 2, 3) average 2; excess 13 bps; floor 0.5.
    r = score_account_v2(_db(20), ACC, V3, "ff" * 32, now_ms=0)["result"]
    t = r["timing"]
    assert t["scored"] is False and "timing" not in r["components"]
    assert t["fills"] == 20 and t["fillsAboveFloor"] == 20
    assert t["meanExcessBps"] == pytest.approx(13.0)
    assert "no material difference" not in t["message"]
    flat = {**V3, "timingFloorBps": {"XUSDT": 20.0}}                                  # floor above the excess
    t2 = score_account_v2(_db(20), ACC, flat, "ff" * 32, now_ms=0)["result"]["timing"]
    assert t2["fillsAboveFloor"] == 0 and t2["message"] == "No material difference between hours."
    none = {k: v for k, v in V3.items() if k != "timingFloorBps"}
    t3 = score_account_v2(_db(20), ACC, none, "ff" * 32, now_ms=0)["result"]["timing"]
    assert t3["fills"] == 0 and t3["message"] == "insufficient data"


def test_older_versions_still_score_as_before():
    r = score_account_v2(make_db(20), ACC, V0, "ff" * 32, now_ms=0)["result"]
    assert r["composite"] == pytest.approx(57.82502529, abs=1e-6) and "timing" in r["components"] and "execution" not in r["components"]
