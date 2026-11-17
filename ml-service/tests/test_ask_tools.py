"""M5 "Ask your execution": the tools the agent may call. Deterministic readers over stored measurements; every value they return is a
number or label that the existing renderer can place, named by its unit (_usd, _bps, _count, _score).

Fixture: three orders (A, B, C) of intended notional 10,000 / 20,000 / 10,000 USD, total cost 2 / 4 / 6 bps, execution 1 / 2 / 3 bps,
fees 0.5 bps each.
  median total = 4;  median execution = 2
  total cost USD = (2 x 10000 + 4 x 20000 + 6 x 10000) / 10000 = (20000 + 80000 + 60000) / 10000 = 16.00
  fees USD       = 0.5 x (10000 + 20000 + 10000) / 10000 = 2.00
  cost per order USD = 2.00 (A), 8.00 (B), 6.00 (C): costliest first is B, C, A."""
import pytest

from agents.ask_tools import TOOLS, build_ctx, run_tools
from agents.render import render


def _om(order_id, total, notional, execution, symbol="BTCUSDT", ec=None, fill_ratio=1.0, reason=None):
    sf = None if total is None else {"totalBps": total, "executionBps": execution, "feesBps": 0.5, "opportunityBps": 0.0,
                                     "intendedNotional": notional, "fillRatio": fill_ratio}
    return {"orderId": order_id, "symbol": symbol, "shortfall": sf, "unmeasuredReason": reason, "expectedCost": ec}


MS = [_om("A", 2, 10000, 1), _om("B", 4, 20000, 2), _om("C", 6, 10000, 3)]
SCORE = {"scoringVersion": "v2.3.0", "result": {"grade": "A", "composite": 93.4, "band": [92.5, 94.1], "fills": 40, "orders": 30}}


def test_the_tools_are_a_fixed_allowlist():
    assert sorted(TOOLS) == ["cost_vs_expected", "costliest", "costs", "score"]


def test_costs_hand_computed():
    ctx = build_ctx(["costs"], SCORE, MS)
    c = ctx["costs"]
    assert c["measured_order_count"] == 3 and c["median_total_bps"] == pytest.approx(4.0) and c["median_execution_bps"] == pytest.approx(2.0)
    assert c["total_cost_usd"] == pytest.approx(16.0) and c["total_fees_usd"] == pytest.approx(2.0)


def test_costliest_orders_by_usd_not_by_bps():
    ctx = build_ctx(["costliest"], SCORE, MS)
    top = ctx["costliest"]["orders"]
    assert [(o["order_id"], o["cost_usd"]) for o in top] == [("B", pytest.approx(8.0)), ("C", pytest.approx(6.0)), ("A", pytest.approx(2.0))]
    assert top[0]["total_bps"] == 4 and top[0]["symbol"] == "BTCUSDT"


def test_costliest_lists_at_most_five():
    many = [_om(f"o{i}", i + 1, 10000, 1) for i in range(9)]
    assert len(build_ctx(["costliest"], SCORE, many)["costliest"]["orders"]) == 5


def test_score_labels_and_numbers():
    s = build_ctx(["score"], SCORE, MS)["score"]
    assert s["grade"] == "A" and s["version"] == "v2.3.0"
    assert s["composite_score"] == pytest.approx(93.4) and s["band_low_score"] == pytest.approx(92.5) and s["band_high_score"] == pytest.approx(94.1)
    assert s["fill_count"] == 40 and s["order_count"] == 30


def test_a_score_without_a_letter_has_no_grade_key_and_says_so():
    s = build_ctx(["score"], {"scoringVersion": "v2.3.0", "result": {"grade": None, "composite": None, "band": None, "fills": 5, "orders": 5,
                                                                    "reason": "fewer than 20 measured fills"}}, MS)["score"]
    assert "grade" not in s and "composite_score" not in s
    assert s["note"] == "no letter grade: fewer than 20 measured fills"


def test_no_score_at_all_is_insufficient_data_not_a_grade():
    assert build_ctx(["score"], None, MS)["score"] == {"note": "insufficient data: no measured score is stored for this account"}


def test_unmeasured_orders_are_counted_apart_never_as_zero():
    ctx = build_ctx(["costs"], SCORE, MS + [_om("U", None, 0, 0, reason="no fresh print")])
    assert ctx["costs"]["measured_order_count"] == 3 and ctx["costs"]["unmeasured_order_count"] == 1
    assert ctx["costs"]["total_cost_usd"] == pytest.approx(16.0)


def test_no_measured_orders_gives_counts_only():
    c = build_ctx(["costs"], SCORE, [])["costs"]
    assert c == {"measured_order_count": 0, "unmeasured_order_count": 0, "note": "insufficient data: no measured orders"}


def test_cost_vs_expected_uses_the_audits_own_aggregate():
    ec = {"applies": True, "expectedBps": 1.0, "version": "ec1.0.0", "calibrationSha256": "x"}
    rows = [_om(f"m{i}", 3, 10000, 3, ec=ec) for i in range(20)]
    e = build_ctx(["cost_vs_expected"], SCORE, rows)["expected"]
    assert e["order_count"] == 20 and e["paid_bps"] == pytest.approx(3.0) and e["expected_bps"] == pytest.approx(1.0) and e["excess_bps"] == pytest.approx(2.0)
    assert e["interval_low_bps"] == pytest.approx(2.0) and e["interval_high_bps"] == pytest.approx(2.0)


def test_cost_vs_expected_with_too_few_orders_says_insufficient_data():
    e = build_ctx(["cost_vs_expected"], SCORE, MS)["expected"]
    assert e["note"].startswith("insufficient data: fewer than 20 market orders")


def test_the_values_render_with_the_existing_renderer():
    ctx = build_ctx(["score", "costs", "costliest"], SCORE, MS)
    r = render("Score {{score.grade}}, {{score.composite_score}} / 100. Cost {{costs.total_cost_usd}}, median {{costs.median_total_bps}}; "
               "most: {{costliest.orders.0.order_id}} at {{costliest.orders.0.cost_usd}}.", ctx)
    assert not r.problems
    assert r.text == "Score A, 93.4 / 100. Cost $16.00, median 4.0 bps; most: B at $8.00."


def test_run_tools_drops_names_that_are_not_tools_and_repeats():
    used, ctx = run_tools(["score", "delete_everything", "score", "shell", "costs"], SCORE, MS)
    assert used == ["score", "costs"] and set(ctx) == {"score", "costs"}


def test_run_tools_takes_at_most_three():
    used, _ = run_tools(["score", "costs", "costliest", "cost_vs_expected"], SCORE, MS)
    assert used == ["score", "costs", "costliest"]
