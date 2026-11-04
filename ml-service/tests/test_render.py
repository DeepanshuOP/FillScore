"""Placeholder renderer tests. Expected strings are hand-computed (arithmetic inline)."""
import pytest

from agents.render import (
    CF_DUMMY, CF_KEYS, RenderError, catalog, format_value, packet_ctx, render,
)

CTX = {
    "fee": {"maker_ratio": 0.2222, "total_fee_paid_usd": 1234.5678, "fee_drag_bps": 10.04,
            "trade_count": 1234, "content_hash": "ab12cd34", "evidence_counts": {"taker_trades": 14}},
    "liquidity": {"avg_slippage_bps": 7.26, "worst_hour_utc": 8, "best_hour_utc": -1,
                  "worst5_slippage_bps": [12.34, 10.0], "market_order_count": 14},
    "risk": {"symbol_hhi": 0.3751, "top_symbol_by_notional": "BTCUSDT",
             "symbol_notional_shares": {"BTCUSDT": 0.75}},
    "alpha": {"best_hour_avg_score": 70.0},
    "cf": {"effect_usd": -2.95, "n_trades_affected": 2},
}


@pytest.mark.parametrize("tpl,expected", [
    ("{{fee.maker_ratio}}", "22.2%"),            # 0.2222*100 = 22.22 -> 22.2
    ("{{fee.total_fee_paid_usd}}", "$1,234.57"),
    ("{{fee.fee_drag_bps}}", "10.0 bps"),
    ("{{fee.trade_count}}", "1,234"),
    ("{{fee.evidence_counts.taker_trades}}", "14"),
    ("{{liquidity.avg_slippage_bps}}", "7.3 bps"),
    ("{{liquidity.worst_hour_utc}}", "08:00 UTC"),
    ("{{liquidity.worst5_slippage_bps.0}}", "12.3 bps"),
    ("{{risk.symbol_hhi}}", "0.38"),
    ("{{risk.top_symbol_by_notional}}", "BTCUSDT"),
    ("{{risk.symbol_notional_shares.BTCUSDT}}", "75.0%"),
    ("{{alpha.best_hour_avg_score}}", "70.0"),
    ("{{cf.effect_usd}}", "-$2.95"),
    ("{{cf.n_trades_affected}}", "2"),
    ("{{ fee.maker_ratio }}", "22.2%"),
    ("slippage was {{liquidity.avg_slippage_bps}} bps", "slippage was 7.3 bps"),
    ("${{fee.total_fee_paid_usd}}", "$1,234.57"),
    ("{{fee.maker_ratio}}%", "22.2%"),
    ("{{fee.maker_ratio}} percent", "22.2%"),
    ("{{fee.total_fee_paid_usd}} USD", "$1,234.57"),
    ("{{liquidity.avg_slippage_bps}} Basis Points", "7.3 bps"),
])
def test_render_ok(tpl, expected):
    r = render(tpl, CTX)
    assert r.text == expected
    assert r.problems == []


@pytest.mark.parametrize("tpl,kind", [
    ("{{fee.content_hash}}", "unrenderable"),
    ("{{fee.evidence_counts}}", "unrenderable"),
    ("{{fee.nope}}", "unknown_placeholder"),
    ("{{nope.x}}", "unknown_placeholder"),
    ("{{liquidity.best_hour_utc}}", "unrenderable"),
])
def test_render_problems_leave_raw(tpl, kind):
    r = render(tpl, CTX)
    assert r.text == tpl
    assert [(p.kind, p.token) for p in r.problems] == [(kind, tpl)]
    assert r.n_rendered == 0


def test_spans():
    r = render("Fees {{fee.total_fee_paid_usd}}.", CTX)
    assert r.text == "Fees $1,234.57."
    assert r.spans == [(5, 14)]
    assert r.n_rendered == 1


def test_stray_braces_are_problems():
    r = render("a {{foo}} b {{ c", CTX)
    assert [p.kind for p in r.problems] == ["unknown_placeholder", "unknown_placeholder"]


def test_format_value_rules():
    assert format_value(["fee", "x_count"], 3) == "3"
    assert format_value(["fee", "longest_taker_streak"], 12) == "12"
    assert format_value(["fee", "flag"], True) == "yes"
    assert format_value(["alpha", "symbol_avg_fill_score", "ETHUSDT"], 60.0) == "60.0"
    assert format_value(["risk", "symbol_hhi"], 0.5) == "0.50"
    assert format_value(["alpha", "hours", "0"], 5) == "05:00 UTC"
    assert format_value(["risk", "adverse_rate_by_symbol", "BTCUSDT"], 0.5) == "50.0%"
    assert format_value(["cf", "target_ratio"], 0.5) == "50.0%"
    with pytest.raises(RenderError):
        format_value(["fee", "metrics_version"], "1.0")
    with pytest.raises(RenderError):
        format_value(["fee", "brand_new_number"], 1.5)
    with pytest.raises(RenderError):
        format_value(["fee", "x"], {"a": 1})
    with pytest.raises(RenderError):
        format_value(["alpha", "hours", "0"], -1)


def test_catalog_sorted_and_filtered():
    lines = catalog(CTX, ["fee", "liquidity", "risk", "alpha"]).splitlines()
    assert "{{fee.maker_ratio}} = 22.2%" in lines
    assert "{{liquidity.worst5_slippage_bps.0}} = 12.3 bps" in lines
    assert "{{risk.symbol_notional_shares.BTCUSDT}} = 75.0%" in lines
    assert "{{fee.evidence_counts.taker_trades}} = 14" in lines
    assert not any("content_hash" in l or "best_hour_utc" in l for l in lines)
    assert lines == sorted(lines)
    assert "cf." not in catalog(CTX, ["fee"])


def test_cf_constants():
    assert CF_KEYS == {"effect_usd", "effect_bps", "n_trades_affected", "threshold_usd", "diff_bps",
                       "from_bps", "to_bps", "shifted_notional_usd", "target_ratio", "median_out_bps"}
    assert set(CF_DUMMY) == CF_KEYS
    assert CF_DUMMY["target_ratio"] == 0.5
    assert all(v == 0 for k, v in CF_DUMMY.items() if k != "target_ratio")


def test_packet_ctx():
    class P:
        def __init__(self, d): self.d = d
        def to_prompt_dict(self): return self.d
    c = packet_ctx(P({"a": 1}), P({"b": 2}), P({"c": 3}), P({"d": 4}))
    assert c == {"fee": {"a": 1}, "risk": {"b": 2}, "liquidity": {"c": 3}, "alpha": {"d": 4}}


def test_packet_savings_are_not_placeholders():
    # 1c.10 F3: the only saving on screen is the recomputed counterfactual, never a packet "savings_at_*"
    from agents.metrics.alpha_packet import AlphaMetricsPacket
    from agents.metrics.fee_packet import FeeMetricsPacket
    from agents.metrics.liquidity_packet import LiquidityMetricsPacket
    from agents.metrics.risk_packet import RiskMetricsPacket
    fee = FeeMetricsPacket("u", "BTCUSDT", "okx", "2026-11-01T00:00:00Z", total_fee_paid_usd=9.7, trade_count=5,
                           savings_at_080_usd=0.08)
    ctx = packet_ctx(fee, RiskMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"),
                     LiquidityMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"),
                     AlphaMetricsPacket("u", "BTCUSDT", "2026-11-01T00:00:00Z"))
    assert "savings_at" not in catalog(ctx, ["fee", "risk", "liquidity", "alpha"])
    r = render("Saved {{fee.savings_at_080_usd}}.", ctx)
    assert [(p.kind, p.token) for p in r.problems] == [("unknown_placeholder", "{{fee.savings_at_080_usd}}")]
    assert fee.to_prompt_dict()["savings_at_080_usd"] == 0.08       # the packet itself is unchanged
    assert render("Fees {{fee.total_fee_paid_usd}}", ctx).text == "Fees $9.70"
