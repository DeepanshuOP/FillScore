"""Hour context from Binance public 1-minute klines (GET /api/v3/klines, weight 2, limit 1000, no key).

Source facts (Binance spot API docs, rest-api.md "Kline/Candlestick data", read 2026-11-18,
https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md): row = [open time, open, high, low, close,
volume (base asset), close time, quote volume, number of trades, ...]; limit default 500, maximum 1000; weight 2; the
IP limit is 6000 request weight per minute; the response header `x-mbx-used-weight-1m` states the weight used.
Measured 2026-11-18: a minute without trades is still returned (0 trades, volume 0, prices of the previous close).

Hand-computed case (lookback 3, min_bars 2): closes of minutes m0..m0+3 are 100, 101, 100, 102, volumes 1, 2, 3, 4.
The context of minute m0+4 uses the minutes m0+1..m0+3 and the close of m0 as the reference:
  returns: ln(101/100) = +0.0099503, ln(100/101) = -0.0099503, ln(102/100) = +0.0198026
  squares: 0.00009901, 0.00009901, 0.00039214  -> sum 0.00059016 -> sqrt 0.0242933 -> sigma 242.93 bps
  volume: 2 + 3 + 4 = 9.
Real fixture: BTCUSDT 2024-01-15 12:59-13:59 UTC. The context of 14:00 from it, sigma 45.908855930778905 bps and volume
1610.94481 BTC, equals the context computed independently from the data.binance.vision daily aggTrades file of that day
(expected_cost.features.hour_context, checked once on 2026-11-18; LOG §U)."""
import hashlib
import json
from pathlib import Path

import pytest

from expected_cost.features import hour_context
from measure.data import klines as K

MIN = 60_000
HOUR = 3_600_000
FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "market" / "BTCUSDT-klines1m-2024-01-15_1259-1400.json"
FIXTURE_SHA = "5fec3358a364701201ec3a26e3229e27d688cfc084879e277411ae1a9909d072"
T_1400 = 1705327200000


def row(open_ms, close, vol, trades=5):
    return [open_ms, str(close), str(close), str(close), str(close), str(vol), open_ms + MIN - 1, "0", trades, "0", "0", "0"]


def window(rows):
    return K.KlineWindow.from_rows("TESTUSDT", rows, [])


def test_hand_computed_context():
    m0 = 100 * MIN
    w = window([row(m0, 100, 1), row(m0 + MIN, 101, 2), row(m0 + 2 * MIN, 100, 3), row(m0 + 3 * MIN, 102, 4)])
    s, v = K.hour_context_from_klines(w, m0 + 4 * MIN + 17_000, lookback=3, min_bars=2)
    assert s == pytest.approx(242.93, abs=0.01)
    assert v == pytest.approx(9.0)


def test_a_missing_minute_carries_the_close_and_has_no_volume():
    m0 = 100 * MIN
    # minute m0+2 is absent: close stays 101, volume 0. returns: ln(101/100), 0, ln(102/101); volume 2 + 0 + 4 = 6.
    w = window([row(m0, 100, 1), row(m0 + MIN, 101, 2), row(m0 + 3 * MIN, 102, 4)])
    s, v = K.hour_context_from_klines(w, m0 + 4 * MIN, lookback=3, min_bars=2)
    # sqrt(0.0099503^2 + 0 + 0.0098523^2) = sqrt(0.000099008 + 0.000097068) = 0.0140027 -> 140.03 bps
    assert s == pytest.approx(140.03, abs=0.01)
    assert v == pytest.approx(6.0)


def test_minutes_with_zero_trades_do_not_count_as_prints():
    m0 = 100 * MIN
    # three context minutes, only one with trades: min_bars 2 is not met -> insufficient data
    w = window([row(m0, 100, 1), row(m0 + MIN, 101, 2), row(m0 + 2 * MIN, 101, 0, trades=0), row(m0 + 3 * MIN, 101, 0, trades=0)])
    assert K.hour_context_from_klines(w, m0 + 4 * MIN, lookback=3, min_bars=2) is None


def test_no_reference_close_means_insufficient_data():
    m0 = 100 * MIN
    w = window([row(m0 + MIN, 101, 2), row(m0 + 2 * MIN, 100, 3), row(m0 + 3 * MIN, 102, 4)])   # nothing at or before m0
    assert K.hour_context_from_klines(w, m0 + 4 * MIN, lookback=3, min_bars=2) is None


def test_the_minute_holding_the_order_is_never_used():
    m0 = 100 * MIN
    rows = [row(m0, 100, 1), row(m0 + MIN, 101, 2), row(m0 + 2 * MIN, 100, 3), row(m0 + 3 * MIN, 102, 4), row(m0 + 4 * MIN, 500, 999)]
    s, v = K.hour_context_from_klines(window(rows), m0 + 4 * MIN + 59_999, lookback=3, min_bars=2)
    assert v == pytest.approx(9.0) and s == pytest.approx(242.93, abs=0.01)


def test_real_fixture_gives_the_context_of_the_daily_tape():
    raw = FIXTURE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == FIXTURE_SHA
    w = K.KlineWindow.from_rows("BTCUSDT", json.loads(raw), [])
    s, v = K.hour_context_from_klines(w, T_1400)
    assert s == pytest.approx(45.908855930778905, rel=1e-12)
    assert v == pytest.approx(1610.94481, rel=1e-12)


def test_klines_equal_the_aggtrade_definition_on_the_aggtrade_fixture_minute():
    # the last aggTrade print of a minute is the kline close: the fixture's 13:59 close 42852.54 is the print before the
    # first 14:00 fixture row (42852.55 at 1705327200001); a spot check that the two sources agree at the seam.
    rows = json.loads(FIXTURE.read_bytes())
    assert rows[-1][0] == T_1400 - MIN and rows[-1][4] == "42852.54000000"


class Fake:
    """get_json(params) -> (rows, used_weight_1m) serving the real fixture; counts requests."""
    def __init__(self, used=2, fail=None):
        self.rows = json.loads(FIXTURE.read_bytes())
        self.calls, self.used, self.fail = [], used, fail

    def __call__(self, params):
        self.calls.append(dict(params))
        if self.fail:
            raise self.fail
        lo, hi, lim = params["startTime"], params["endTime"], params["limit"]
        return [r for r in self.rows if lo <= r[0] <= hi][:lim], self.used


def _store(fake, **kw):
    return K.KlineStore(get_json=fake, **kw)


NOW = T_1400 + 10 * HOUR


def test_window_fetches_whole_hour_blocks_with_limit_and_weight():
    fake = Fake()
    st = _store(fake)
    w = st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    assert [(c["startTime"], c["endTime"], c["limit"], c["interval"], c["symbol"]) for c in fake.calls] == [
        (T_1400 - 2 * HOUR, T_1400 - HOUR - 1, 60, "1m", "BTCUSDT"), (T_1400 - HOUR, T_1400 - 1, 60, "1m", "BTCUSDT")]
    assert st.requests == 2 and st.weight == 4          # two requests, weight 2 each
    assert {r.dataset for r in w.refs} == {"api/v3/klines"} and all(r.source == "data-api.binance.vision" for r in w.refs)
    assert [r.window for r in w.refs] == [(T_1400 - 2 * HOUR, T_1400 - HOUR - 1), (T_1400 - HOUR, T_1400 - 1)]
    block = [r for r in fake.rows if T_1400 - HOUR <= r[0] < T_1400]
    assert w.refs[1].sha256 == hashlib.sha256(json.dumps(block, separators=(",", ":")).encode()).hexdigest()


def test_a_finished_hour_is_cached_per_symbol_hour():
    fake = Fake()
    st = _store(fake)
    st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    n = len(fake.calls)
    st.window("BTCUSDT", T_1400 - 61 * MIN + 5 * MIN, T_1400 - 1 + 5 * MIN, NOW)    # an order five minutes later: hour 13 reused, hour 14 new
    assert len(fake.calls) == n + 1
    st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)                      # same again: nothing fetched
    assert len(fake.calls) == n + 1


def test_the_running_hour_is_not_cached():
    fake = Fake()
    st = _store(fake)
    now = T_1400 + 20 * MIN                                                       # hour 14 is still running
    st.window("BTCUSDT", T_1400 - 40 * MIN, T_1400 + 10 * MIN, now)
    n = len(fake.calls)
    st.window("BTCUSDT", T_1400 - 40 * MIN, T_1400 + 10 * MIN, now)
    assert len(fake.calls) == n + 1                                               # the finished hour came from cache, the running one was fetched again


def test_a_failed_request_raises_unavailable_and_the_job_stops_asking():
    st = _store(Fake(fail=ConnectionError("down")))
    with pytest.raises(K.KlineUnavailable):
        st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)


def test_rate_limit_response_stops_all_further_requests_of_the_job():
    fake = Fake(fail=K.RateLimited(30))
    st = _store(fake)
    with pytest.raises(K.KlineUnavailable):
        st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    calls = len(fake.calls)
    with pytest.raises(K.KlineUnavailable):
        st.window("ETHUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    assert len(fake.calls) == calls                                              # no request after a 429 or 418


def test_high_used_weight_makes_the_store_back_off():
    fake = Fake(used=4900)                                                       # above 80% of 6000
    st = _store(fake)
    with pytest.raises(K.KlineUnavailable):
        st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)                 # the second block is refused
    assert len(fake.calls) == 1


def test_the_request_budget_of_one_job_is_enforced_and_start_job_resets_it():
    fake = Fake()
    st = _store(fake, max_requests=2)
    st.window("BTCUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    with pytest.raises(K.KlineUnavailable):
        st.window("ETHUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)
    st.start_job()
    st.window("ETHUSDT", T_1400 - 61 * MIN, T_1400 - 1, NOW)                     # served empty by the fake, but the request was allowed


def test_bad_rows_are_refused():
    def bad(params):
        return [row(T_1400 - HOUR + 7, 1, 1)], 2                                 # open time not on a minute
    with pytest.raises(K.KlineUnavailable):
        K.KlineStore(get_json=bad).window("BTCUSDT", T_1400 - HOUR, T_1400 - 1, NOW)
