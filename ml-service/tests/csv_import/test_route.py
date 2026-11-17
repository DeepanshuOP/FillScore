"""POST /ml/csv/check: a signed-in account sends a CSV and gets back each fill compared with the public price at that second. Nothing is
stored and the file's text is never logged. Demo ids and anonymous callers are refused. Budget: 6 checks an hour and 20 a day per account,
because each check fetches public market data."""
import time

import jwt
import pytest
from fastapi.testclient import TestClient

import main
from csv_import import route_budget
from tests.csv_import.test_check import Source
from tests.csv_import.test_service import KRAKEN

client = TestClient(main.app)
USER = "acct-real-csv"


def _h(user=USER):
    t = jwt.encode({"exp": int(time.time()) + 300, "userId": user, "typ": "access"}, main.JWT_ACCESS_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    from csv_import import gate
    route_budget.reset()
    gate.reset()
    import measure.service as svc
    monkeypatch.setattr(svc, "rest_source", Source())
    yield
    route_budget.reset()
    gate.reset()


def _post(body=None, headers=None):
    return client.post("/ml/csv/check", json=body if body is not None else {"format": "kraken", "csv": KRAKEN}, headers=headers if headers is not None else _h())


def test_a_signed_in_account_gets_the_comparison():
    r = _post()
    assert r.status_code == 200
    b = r.json()
    assert b["summary"]["measured"] == 2 and b["summary"]["median_eff_half_bps"] == pytest.approx(2.0)
    assert "not yet checked against a real file" in b["provenance"]
    assert b["stored"] is False


def test_anonymous_and_demo_callers_are_refused():
    assert _post(headers={}).status_code == 401
    assert _post(headers=_h("demo-moderate")).status_code == 403


def test_a_mapped_request_carries_the_mapping():
    csv = "Time,Product,Side,Price,Size,Fee\n2024-01-15T14:00:01.123Z,BTC-USD,BUY,100.02,1.0,0.160032\n"
    m = {"time": "Time", "pair": "Product", "side": "Side", "price": "Price", "quantity": "Size", "fee": "Fee", "time_format": "iso"}
    r = _post({"format": "mapped", "csv": csv, "mapping": m})
    assert r.status_code == 200 and r.json()["summary"]["measured"] == 1


def test_errors_have_a_code_and_a_plain_message_and_never_echo_the_file(capsys):
    secret_row = "SECRET-TXID-123,O1,XBT/USD,not-a-time,buy,market,1,1,0,1,0,,\n"
    r = _post({"format": "kraken", "csv": KRAKEN.splitlines()[0] + "\n" + secret_row})
    assert r.status_code == 400 and r.json()["detail"]["code"] == "no_fills"
    assert "SECRET-TXID-123" not in r.text
    out = capsys.readouterr()
    assert "SECRET-TXID-123" not in out.out + out.err
    big = _post({"format": "kraken", "csv": "x" * 250_000})
    assert big.status_code == 413 and big.json()["detail"]["code"] == "file_too_large"
    assert _post({"format": "nope", "csv": "a"}).status_code == 422
    assert _post({"format": "kraken", "csv": "x" * 300_001}).status_code == 422


def test_six_checks_an_hour_per_account_then_429_with_retry_after_and_other_accounts_are_not_affected():
    for _ in range(6):
        assert _post().status_code == 200
    blocked = _post()
    assert blocked.status_code == 429
    assert blocked.json()["detail"]["code"] == "csv_check_limit"
    assert int(blocked.headers["Retry-After"]) > 0
    assert _post(headers=_h("acct-other")).status_code == 200


def test_a_refused_file_does_not_use_up_a_check():
    for _ in range(10):
        assert _post({"format": "kraken", "csv": "a,b\n1,2\n"}).status_code == 400
    assert _post().status_code == 200


# ---- review findings (2026-11-18): budget reserved before the work, load bounded, no 500 detail, no echo of the file ----

def test_the_slot_is_reserved_before_the_check_so_parallel_requests_cannot_all_pass():
    a = route_budget.reserve("acct-par")
    assert a == ("ok", None)
    assert route_budget.reserve("acct-par")[0] == "busy"          # one check at a time per account
    route_budget.release("acct-par", refund=False)
    for _ in range(5):
        assert route_budget.reserve("acct-par")[0] == "ok"
        route_budget.release("acct-par", refund=False)
    status, wait = route_budget.reserve("acct-par")               # the seventh in the hour
    assert status == "limit" and wait > 0
    route_budget.reset()
    assert route_budget.reserve("acct-par")[0] == "ok"
    route_budget.release("acct-par", refund=True)                 # a refund gives the slot back
    for _ in range(6):
        assert route_budget.reserve("acct-par")[0] == "ok"
        route_budget.release("acct-par", refund=False)


def test_a_check_that_fails_unexpectedly_counts_and_says_nothing_about_the_cause(monkeypatch, capsys):
    import csv_import.service as service

    def boom(*a, **k):
        raise RuntimeError("boom SECRET-IN-MESSAGE")
    monkeypatch.setattr(service, "run_check", boom)
    for _ in range(6):
        r = _post()
        assert r.status_code == 500 and r.json()["detail"] == {"code": "internal", "message": "The file could not be checked."}
        assert "SECRET-IN-MESSAGE" not in r.text
    assert _post().status_code == 429                              # six failures used the six checks: a crafted file has no free attempts
    out = capsys.readouterr()
    assert "SECRET-IN-MESSAGE" not in out.out + out.err


def test_at_most_two_checks_run_at_once_in_the_whole_service():
    from csv_import import gate
    assert gate.try_enter() and gate.try_enter()
    try:
        r = _post()
        assert r.status_code == 429 and r.json()["detail"]["code"] == "csv_check_busy"
        assert _post(headers=_h("acct-other")).status_code == 429
    finally:
        gate.leave(); gate.leave()
    assert _post().status_code == 200                              # the refused attempt did not use a check


def test_a_rate_limit_answer_from_the_market_data_source_stops_the_check_and_every_check_for_a_while(monkeypatch):
    import measure.service as svc
    from csv_import import gate

    class Resp:
        status_code = 429
        headers = {"Retry-After": "45"}

    class Http429(Exception):
        response = Resp()

    calls = []

    def source(symbol, start, end):
        calls.append(symbol)
        raise Http429()
    monkeypatch.setattr(svc, "rest_source", source)
    r = _post()
    assert r.status_code == 503 and r.json()["detail"]["code"] == "market_data_busy"
    assert int(r.headers["Retry-After"]) == 45
    assert len(calls) == 1                                         # the first 429 ended the check: no further request
    n = len(calls)
    again = _post()
    assert again.status_code == 503 and again.json()["detail"]["code"] == "market_data_busy" and len(calls) == n   # cooling down: no request at all
    gate.reset()
    monkeypatch.setattr(svc, "rest_source", Source())
    assert _post().status_code == 200                              # and the 429 did not use up a check (6 more are still allowed)


def test_a_validation_error_never_echoes_the_file_and_an_oversized_body_is_refused_before_it_is_read():
    r = _post({"format": "nope", "csv": "SECRET-BODY-TEXT"})
    assert r.status_code == 422 and "SECRET-BODY-TEXT" not in r.text
    big = client.post("/ml/csv/check", content=b'{"format":"kraken","csv":"' + b"x" * 450_000 + b'"}',
                      headers={**_h(), "Content-Type": "application/json"})
    assert big.status_code == 413 and "xxxx" not in big.text

