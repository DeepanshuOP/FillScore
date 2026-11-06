import observability.sentry_init as si
from observability.scrub import FILTERED, before_send


def _event():
    return {
        "request": {"url": "http://x/api", "method": "POST", "data": {"apiKey": "AK", "note": "n"},
                    "cookies": {"sid": "1"}, "query_string": "token=abc",
                    "headers": {"Authorization": "Bearer abc.def", "Cookie": "sid=1", "X-Api-Key": "k",
                                "Accept": "json"}},
        "user": {"email": "a@b.c", "id": "u"},
        "extra": {"MONGODB_URI": "mongodb+srv://u:p@h/db", "apiSecret": "S", "passphrase": "P",
                  "msg": "connect mongodb://u:p@h:1/x failed", "n": 3},
        "breadcrumbs": [{"data": {"jwtToken": "t", "ok": 1}}],
    }


def test_scrubber_removes_each_sensitive_thing():
    e = before_send(_event())
    r = e["request"]
    assert "data" not in r and "cookies" not in r and "query_string" not in r      # bodies, cookies
    assert r["headers"]["Authorization"] == FILTERED and r["headers"]["Cookie"] == FILTERED
    assert r["headers"]["X-Api-Key"] == FILTERED and r["headers"]["Accept"] == "json"
    assert "user" not in e                                                          # no identity
    assert e["extra"]["MONGODB_URI"] == FILTERED                                   # uri-named field
    assert e["extra"]["apiSecret"] == FILTERED and e["extra"]["passphrase"] == FILTERED  # exchange payload
    assert "mongodb" not in e["extra"]["msg"] and e["extra"]["n"] == 3             # uri inside a string
    assert e["breadcrumbs"][0]["data"] == {"jwtToken": FILTERED, "ok": 1}


def test_query_strings_and_emails_in_values_are_removed():
    e = before_send({"request": {"url": "http://x/reset-password?token=abc123"},
                     "exception": {"values": [{"value": "E11000 dup key: { email: \"bob@x.com\" }"}]}})
    assert "abc123" not in e["request"]["url"] and e["request"]["url"].startswith("http://x/reset-password?")
    assert "bob@x.com" not in e["exception"]["values"][0]["value"]


def test_init_disables_local_variables(monkeypatch):
    called = []
    monkeypatch.setattr("sentry_sdk.init", lambda **k: called.append(k))
    si.init_sentry({"SENTRY_DSN": "https://k@o0.ingest.sentry.io/1"})
    assert called[0]["include_local_variables"] is False


def test_init_skipped_without_dsn(monkeypatch):
    called = []
    monkeypatch.setattr("sentry_sdk.init", lambda **k: called.append(k))
    assert si.init_sentry({}) is False and called == []


def test_init_with_dsn_is_pii_off_and_scrubbed(monkeypatch):
    called = []
    monkeypatch.setattr("sentry_sdk.init", lambda **k: called.append(k))
    assert si.init_sentry({"SENTRY_DSN": "https://k@o0.ingest.sentry.io/1"}) is True
    assert called[0]["send_default_pii"] is False and called[0]["before_send"] is before_send
