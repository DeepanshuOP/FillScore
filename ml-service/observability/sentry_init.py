"""Sentry for the ml-service: a no-op unless SENTRY_DSN is set."""
from __future__ import annotations

import os

from observability.scrub import before_send


def init_sentry(env=None) -> bool:
    env = os.environ if env is None else env
    dsn = (env.get("SENTRY_DSN") or "").strip()
    if not dsn:
        return False
    import sentry_sdk
    sentry_sdk.init(dsn=dsn, send_default_pii=False, before_send=before_send, traces_sample_rate=0,
                    environment=env.get("SENTRY_ENVIRONMENT") or ("production" if "RENDER" in env else "dev"),
                    max_request_body_size="never",
                    include_local_variables=False,   # frame vars would carry prompts, trades, packets
                    include_source_context=False)
    return True
