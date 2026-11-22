"""The Council page's benchmark line is computed from the alpha packet, not read from the model's rating.

Direction (agents/metrics/alpha_packet.py): median_vwap_deviation_bps = (price - vwap5m) / vwap5m * 10000 * side,
so a positive value means the fills paid more than (or sold for less than) the 5-minute VWAP: "worse than".
A negative value is "better than". The words are decided on the figure as printed (one decimal), so a median of
0.04 bps, which prints as 0.0, is "equal to" and never "0.0 bps worse than".

Hand cases (fills = vwap_trades_count):
  +1.2345 -> printed 1.2, worse than      -2.76 -> printed 2.8 (2.76 rounds to 2.8), better than
  0.0 -> equal to      +0.04 -> prints 0.0 -> equal to      -0.04 -> prints 0.0, no "-0.0" -> equal to
  no median key (vwap_trades_count 0) -> insufficient data; no packet -> None (nothing to say)
"""
from agents.benchmark_line import benchmark_line


def alpha(median, fills=88, orders=40):
    d = {"market_order_count": orders, "vwap_trades_count": fills}
    if median is not None:
        d["median_vwap_deviation_bps"] = median
    return d


def test_positive_median_is_worse_than():
    b = benchmark_line(alpha(1.2345))
    assert b["direction"] == "worse than" and b["state"] == "measured"
    assert b["statement"] == "Market-order fills: median 1.2 bps worse than the 5-minute VWAP (88 fills)"
    assert b["medianBps"] == 1.2345 and b["fills"] == 88


def test_negative_median_is_better_than():
    b = benchmark_line(alpha(-2.76))
    assert b["direction"] == "better than"
    assert b["statement"] == "Market-order fills: median 2.8 bps better than the 5-minute VWAP (88 fills)"


def test_zero_median_is_equal_to():
    b = benchmark_line(alpha(0.0))
    assert b["direction"] == "equal to"
    assert b["statement"] == "Market-order fills: median equal to the 5-minute VWAP (88 fills)"


def test_a_median_that_prints_as_zero_is_equal_to_in_both_signs():
    assert benchmark_line(alpha(0.04))["direction"] == "equal to"
    b = benchmark_line(alpha(-0.04))
    assert b["direction"] == "equal to" and "-0.0" not in b["statement"]


def test_no_benchmark_is_insufficient_data_not_zero():
    b = benchmark_line(alpha(None, fills=0, orders=12))
    assert b["state"] == "insufficient"
    assert b["direction"] is None and b["medianBps"] is None
    assert b["statement"] == "Benchmark comparison: insufficient data (no market-order fill had a 5-minute VWAP)"


def test_one_fill_is_singular():
    assert benchmark_line(alpha(3.0, fills=1))["statement"].endswith("(1 fill)")


def test_no_packet_gives_nothing():
    assert benchmark_line(None) is None
