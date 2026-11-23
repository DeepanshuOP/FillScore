"""The production expected-cost hook, on the real kline fixture (BTCUSDT 12:59-13:59 UTC, 2024-01-15) and the committed
calibration ec1.0.0 (BTCUSDT: half-spread 0.0011748676534804586 bps, Y 0.39682228730242053, bucket 1k-10k q 0.6286437193067611).

Hand-computed: order MARKET, arrival 14:00:30, quantity 0.161094481 BTC, intended notional 6903 USD (bucket 1k-10k).
  context (fixture): sigma 45.908855930778905 bps, volume 1610.94481 BTC;  Q / V = 0.161094481 / 1610.94481 = 1e-4
  x = sigma sqrt(Q / V) = 45.9088559 * 0.01 = 0.459088559 (inside the calibrated range [0.00774, 3.1632])
  expected = 0.00117487 + 0.39682229 * 0.459088559 = 0.00117487 + 0.18217657 = 0.18335144 bps
  interval = expected -/+ 0.62864372 = [-0.44529228, 0.81199516]."""
import hashlib
import json
from pathlib import Path

import pytest

from expected_cost.model import load_calibration
from expected_cost.runtime import kline_expected_cost_hook
from measure.data import klines as K
from tests.measure.test_klines import FIXTURE, HOUR, T_1400, Fake

NOW = T_1400 + 10 * HOUR
CAL = load_calibration()


def _info(**over):
    a = dict(symbol="BTCUSDT", orderId=1, arrivalMs=T_1400 + 30_000, orderType="MARKET", orderedQty=0.161094481,
             shortfall={"intendedNotional": 6903.0})
    a.update(over)
    return a


def _hook(fake):
    return kline_expected_cost_hook(K.KlineStore(get_json=fake), CAL, now_ms=lambda: NOW)


def test_a_real_account_market_order_gets_expected_cost_from_klines():
    fake = Fake()
    r = _hook(fake)(_info())
    assert r["applies"] is True and r["reason"] is None
    assert r["expectedBps"] == pytest.approx(0.18335144, abs=1e-7)
    assert r["lowBps"] == pytest.approx(-0.44529228, abs=1e-7) and r["highBps"] == pytest.approx(0.81199516, abs=1e-7)
    assert r["bucket"] == "1k-10k" and r["version"] == "ec1.0.0"
    assert r["context"]["sigmaBps"] == pytest.approx(45.908855930778905, rel=1e-12)
    assert r["context"]["volume"] == pytest.approx(1610.94481, rel=1e-12)
    assert len(fake.calls) == 2                                                  # hours 12 and 13, weight 2 each


def test_lineage_refs_name_the_kline_hours_with_their_hashes():
    r = _hook(Fake())(_info())
    assert r["contextSource"] == "api/v3/klines"
    assert [(x["source"], x["dataset"], x["symbol"], tuple(x["window"])) for x in r["contextRefs"]] == [
        ("data-api.binance.vision", "api/v3/klines", "BTCUSDT", (T_1400 - 2 * HOUR, T_1400 - HOUR - 1)),
        ("data-api.binance.vision", "api/v3/klines", "BTCUSDT", (T_1400 - HOUR, T_1400 - 1))]
    hour13 = [x for x in json.loads(FIXTURE.read_bytes()) if T_1400 - HOUR <= x[0] < T_1400]
    assert r["contextRefs"][1]["sha256"] == hashlib.sha256(json.dumps(hour13, separators=(",", ":")).encode()).hexdigest()


@pytest.mark.parametrize("over,why", [({"orderType": "LIMIT"}, "taker"), ({"symbol": "XRPUSDT"}, "not calibrated"), ({"orderType": None}, "unknown")])
def test_orders_the_model_cannot_price_make_no_request(over, why):
    fake = Fake()
    r = _hook(fake)(_info(**over))
    assert r["expectedBps"] is None and why in r["reason"]
    assert fake.calls == []


def test_a_failed_source_is_reported_as_unavailable_not_as_missing_data():
    r = _hook(Fake(fail=K.RateLimited(5)))(_info())
    assert r["expectedBps"] is None and r["applies"] is True
    assert "could not be read" in r["reason"] and "rate limited" in r["reason"]


def test_an_hour_without_enough_trades_is_insufficient_data():
    r = _hook(Fake())(_info(arrivalMs=T_1400 - 40 * 60_000))                     # the hour before 13:20 has only 22 fixture minutes
    assert r["expectedBps"] is None and "no market context" in r["reason"]


def test_the_second_order_of_the_hour_costs_no_new_request():
    fake = Fake()
    h = _hook(fake)
    h(_info())
    n = len(fake.calls)
    h(_info(orderId=2, arrivalMs=T_1400 + 45_000))
    assert len(fake.calls) == n
