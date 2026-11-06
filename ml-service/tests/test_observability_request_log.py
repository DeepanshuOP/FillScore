import json

from fastapi.testclient import TestClient

import main
from observability.request_log import hash_account_id

client = TestClient(main.app)


def test_hash_is_12_hex_and_hides_the_id():
    h = hash_account_id("acct-1")
    assert len(h) == 12 and int(h, 16) >= 0 and "acct" not in h
    assert hash_account_id(None) is None


def test_request_gets_an_id_and_a_json_log_line(capsys):
    r = client.get("/health", headers={"x-request-id": "abcdef123456"})
    assert r.headers["x-request-id"] == "abcdef123456"
    rec = json.loads(next(l for l in capsys.readouterr().out.splitlines() if '"msg": "request"' in l))
    assert rec["requestId"] == "abcdef123456" and rec["path"] == "/health" and rec["account"] is None


def test_unsafe_incoming_id_is_replaced():
    r = client.get("/health", headers={"x-request-id": "bad id!"})
    assert len(r.headers["x-request-id"]) == 36
