"""The comparison of imported fills with public prints (M6 §1). Same quote rules and same effective half-spread as the measurement job
(measure.benchmarks.quote_at, measure.metrics.effective_half_spread_bps): the mid-price is built from the last public print on each side
strictly before the fill, none older than 5 s.

Hand-computed fixture. Tape of BTCUSDT: before each fill a bid-side print 99.99 (2 s before) and an ask-side print 100.01 (1 s before), so
the mid before the fill is (99.99 + 100.01) / 2 = 100.00.
  buy  1.0 at 100.02: effective half-spread = (100.02 - 100.00) / 100.00 x 1e4 = 2.0 bps;  fee 0.160032 / cost 100.02 = 16.0 bps
  sell 1.0 at  99.98: effective half-spread = -(99.98 - 100.00) / 100.00 x 1e4 = 2.0 bps;  fee 0.159968 / cost  99.98 = 16.0 bps
  cost against the mid in quote units: 2.0 / 1e4 x 100.02 = 0.020004 and 2.0 / 1e4 x 99.98 = 0.019996, together 0.04; fees together 0.32"""
import pytest

from csv_import.check import ASSUMPTIONS, check_fills
from csv_import.kraken import KrakenFill
from measure.data.aggtrades import AggTradeWindow

F1 = 1_705_327_201_123
F2 = F1 + 10_000


def _tape():
    rows, i = [], 1
    for f in (F1, F2):
        rows += [(i, 99.99, 1.0, f - 2000, True), (i + 1, 100.01, 1.0, f - 1000, False)]
        i += 2
    return AggTradeWindow.from_rows("BTCUSDT", rows, [])


class Source:
    def __init__(self, window=None, fail=False):
        self.window, self.fail, self.calls = window or _tape(), fail, []

    def __call__(self, symbol, start, end):
        self.calls.append((symbol, start, end))
        if self.fail:
            raise ConnectionError("down")
        return self.window.between(start, end + 1)


def _fill(txid="T1", side=1, ts=F1, price=100.02, fee=0.160032, base="XBT", quote="USD", taker=True):
    cost = price * 1.0
    return KrakenFill(txid=txid, order_id="O" + txid, base=base, quote=quote, side=side, ts_ms=ts, price=price, qty=1.0, cost=cost, fee=fee,
                      fee_bps=fee / cost * 1e4, taker=taker, order_type="market")


BUY, SELL = _fill(), _fill("T2", side=-1, ts=F2, price=99.98, fee=0.159968)


def test_each_fill_is_compared_with_the_mid_before_it_hand_computed():
    r = check_fills([BUY, SELL], Source())
    a, b = r.fills
    assert a.mid == pytest.approx(100.0) and a.eff_half_bps == pytest.approx(2.0) and a.fee_bps == pytest.approx(16.0)
    assert b.mid == pytest.approx(100.0) and b.eff_half_bps == pytest.approx(2.0)
    assert a.total_bps == pytest.approx(18.0)
    assert a.cost_usd == pytest.approx(0.020004) and b.cost_usd == pytest.approx(0.019996)
    assert a.symbol == "BTCUSDT"


def test_the_summary_is_over_measured_fills_only():
    s = check_fills([BUY, SELL], Source()).summary
    assert s["fills"] == 2 and s["measured"] == 2 and s["unmeasured"] == 0
    assert s["median_eff_half_bps"] == pytest.approx(2.0) and s["weighted_eff_half_bps"] == pytest.approx(2.0)
    assert s["total_eff_cost_usd"] == pytest.approx(0.04) and s["total_fee_usd"] == pytest.approx(0.32)


def test_the_reference_symbol_is_binance_usdt_and_one_request_covers_a_fill_s_five_seconds():
    src = Source()
    check_fills([BUY], src)
    assert src.calls == [("BTCUSDT", F1 - 5000, F1)]


def test_a_non_dollar_quote_is_not_measured_and_makes_no_request():
    src = Source()
    r = check_fills([BUY, _fill("T3", quote="EUR")], src)
    eur = r.fills[1]
    assert eur.eff_half_bps is None and "EUR" in eur.unmeasured_reason
    assert len(src.calls) == 1                                                     # only the dollar fill asked for market data


def test_no_fresh_print_before_the_fill_is_unmeasured_never_zero():
    r = check_fills([_fill("T4", ts=F2 + 600_000)], Source())
    f = r.fills[0]
    assert f.eff_half_bps is None and f.unmeasured_reason == "no fresh print within 5000 ms before the fill"
    assert r.summary["measured"] == 0 and r.summary["median_eff_half_bps"] is None and r.summary["total_eff_cost_usd"] is None


def test_a_failed_market_data_request_leaves_that_fill_unmeasured_and_the_rest_intact():
    class Flaky(Source):
        def __call__(self, symbol, start, end):
            if start == F2 - 5000:
                raise ConnectionError("down")
            return super().__call__(symbol, start, end)
    r = check_fills([BUY, SELL], Flaky())
    assert r.fills[0].eff_half_bps == pytest.approx(2.0)
    assert r.fills[1].eff_half_bps is None and r.fills[1].unmeasured_reason == "market data could not be fetched"
    assert r.summary["measured"] == 1 and r.summary["unmeasured"] == 1


def test_unmeasured_reasons_are_counted():
    r = check_fills([BUY, _fill("T3", quote="EUR"), _fill("T4", ts=F2 + 600_000)], Source())
    assert r.summary["unmeasured_reasons"] == {"no USD-quoted reference market for the quote currency EUR": 1, "no fresh print within 5000 ms before the fill": 1}


def test_the_assumptions_are_stated_with_every_result():
    r = check_fills([BUY], Source())
    assert r.assumptions == ASSUMPTIONS
    text = " ".join(ASSUMPTIONS)
    assert "USDT" in text and "assumption" in text.lower() and "Kraken" in text


def test_no_fills_is_an_empty_summary_not_an_error():
    r = check_fills([], Source())
    assert r.summary["fills"] == 0 and r.summary["median_eff_half_bps"] is None and r.fills == []


def test_the_text_of_the_result_has_no_advice_and_no_cause():
    import re
    bad = re.compile(r"\b(should|recommend\w*|consider|opportunit\w*|could (have|save)|saved|savings?|because|due to|caused by|compliant)\b", re.I)
    for s in ASSUMPTIONS:
        assert not bad.search(s), s
