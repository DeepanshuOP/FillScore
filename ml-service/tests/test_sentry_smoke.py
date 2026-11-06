"""T3: the ml Sentry smoke goes through the production init (scrubber attached) and reports sent/not-sent."""
from __future__ import annotations

import sentry_sdk

from scripts import sentry_smoke


def test_no_dsn_is_not_sent_and_captures_nothing(monkeypatch):
    called = []
    monkeypatch.setattr(sentry_sdk, "capture_message", lambda *a, **k: called.append(a))
    assert sentry_smoke.smoke(env={}) == (False, "no SENTRY_DSN") and called == []


def test_dsn_uses_production_init_with_scrubber_and_sends(monkeypatch):
    from observability.scrub import before_send
    init_kw, msgs = {}, []
    monkeypatch.setattr(sentry_sdk, "init", lambda **k: init_kw.update(k))
    monkeypatch.setattr(sentry_sdk, "capture_message", lambda m, *a, **k: msgs.append(m) or "abc123")
    monkeypatch.setattr(sentry_sdk, "flush", lambda timeout=None: True)
    sent, why = sentry_sdk and sentry_smoke.smoke(env={"SENTRY_DSN": "https://k@o0.ingest.sentry.io/1"})
    assert sent is True and msgs == ["sentry-smoke"]
    assert init_kw["before_send"] is before_send and init_kw["send_default_pii"] is False
    assert "k@o0" not in why                       # DSN never echoed
