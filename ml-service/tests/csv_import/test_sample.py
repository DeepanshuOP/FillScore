"""The committed sample broker file (A5, orders of 2026-11-23): 24 synthetic Kraken fills whose times and prices are real BTCUSDT prints
(Binance aggTrades, the first print at or after :13 of the minutes :07, :24 and :41 of two hours on each of 2026-09-02 to 2026-09-05).
It goes through the same check as a user's file (csv_import.service.run_check).

Hand count: 4 days x 2 hours x 3 minutes = 24 fills, 6 a day; the fee is 0.1% of cost (the published base spot rate), so every fill's
fee_bps is 0.001 x cost / cost x 1e4 = 10.0.
Hand tape for the check: a bid-side print P - 1 two seconds before each fill and an ask-side print P + 1 one second before, so the mid
before a fill at price P is P and its effective half-spread is (P - P) / P x 1e4 = 0.0 bps; total = 0.0 + 10.0 = 10.0 bps."""
import hashlib
import time

import jwt
import pytest
from fastapi.testclient import TestClient

import main
from csv_import import sample
from csv_import.kraken import parse_trades
from csv_import.service import run_check
from measure.data.aggtrades import AggTradeWindow


def test_the_file_reads_as_24_fills_six_a_day_none_skipped():
    p = parse_trades(sample.sample_csv())
    assert len(p.fills) == 24 and p.skipped == [] and p.fee_known
    days = sorted({__import__("datetime").datetime.fromtimestamp(f.ts_ms / 1000, __import__("datetime").timezone.utc).strftime("%Y-%m-%d") for f in p.fills})
    assert days == ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]
    assert all(f.base == "XBT" and f.quote == "USD" for f in p.fills)
    assert all(f.fee_bps == pytest.approx(10.0, abs=1e-4) for f in p.fills)


def test_the_file_is_pinned_a_change_is_a_decision():
    assert hashlib.sha256(sample.sample_csv().encode()).hexdigest() == sample.SAMPLE_SHA256


class HandSource:
    """For every fill: bid print P - 1 at t - 2000 and ask print P + 1 at t - 1000 (P from the file), whatever window is asked."""
    def __init__(self):
        self.calls = 0
        rows, i = [], 1
        for f in parse_trades(sample.sample_csv()).fills:
            rows += [(i, f.price - 1, 1.0, f.ts_ms - 2000, True), (i + 1, f.price + 1, 1.0, f.ts_ms - 1000, False)]
            i += 2
        self.window = AggTradeWindow.from_rows("BTCUSDT", rows, [])

    def __call__(self, symbol, start, end):
        self.calls += 1
        return self.window.between(start, end + 1)


def test_run_sample_is_the_same_check_with_the_label():
    r = sample.run_sample(HandSource())
    assert r["sample"] == {"label": "Sample file: synthetic fills, real prices", "sha256": sample.SAMPLE_SHA256}
    assert r["summary"]["fills"] == 24 and r["summary"]["measured"] == 24
    assert r["summary"]["median_eff_half_bps"] == pytest.approx(0.0, abs=1e-6)
    assert all(f["total_bps"] == pytest.approx(10.0, abs=1e-4) for f in r["fills"])
    assert r["stored"] is False
    plain = run_check("kraken", sample.sample_csv(), None, HandSource())
    assert {k: v for k, v in r.items() if k != "sample"} == plain          # nothing else differs from a user's file


client = TestClient(main.app)


def _service_headers(account="sample-file"):
    now = int(time.time())
    t = jwt.encode({"typ": "measure", "accountId": account, "iat": now, "exp": now + 120}, main._service_token_secret() or "", algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    from csv_import import gate
    monkeypatch.setenv("ML_SERVICE_TOKEN_SECRET", "s" * 40)
    gate.reset()
    import measure.service as svc
    monkeypatch.setattr(svc, "rest_source", HandSource())
    yield
    gate.reset()


def test_the_internal_route_needs_the_service_token_and_takes_no_body_content():
    assert client.post("/internal/csv-sample", json={"accountId": "sample-file"}).status_code == 401
    r = client.post("/internal/csv-sample", json={"accountId": "sample-file"}, headers=_service_headers())
    assert r.status_code == 200 and r.json()["sample"]["label"] == "Sample file: synthetic fills, real prices"
    assert client.post("/internal/csv-sample", json={"accountId": "other"}, headers=_service_headers()).status_code == 403


def test_a_user_token_is_not_a_service_token():
    t = jwt.encode({"exp": int(time.time()) + 300, "userId": "acct-x", "typ": "access"}, main.JWT_ACCESS_SECRET, algorithm="HS256")
    assert client.post("/internal/csv-sample", json={"accountId": "sample-file"}, headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_a_pause_from_the_market_data_source_is_honoured_before_any_fetch():
    from csv_import import gate
    gate.set_cooldown(30)
    r = client.post("/internal/csv-sample", json={"accountId": "sample-file"}, headers=_service_headers())
    assert r.status_code == 503 and r.json()["detail"]["code"] == "market_data_busy" and "Retry-After" in r.headers
