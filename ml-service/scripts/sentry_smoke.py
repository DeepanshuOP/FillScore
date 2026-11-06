"""Send ONE Sentry event (message "sentry-smoke") through the production init + scrubber, flush, print sent/not-sent.

  .venv/bin/python scripts/sentry_smoke.py

Needs SENTRY_DSN in ml-service/.env (or the environment); without it, prints not-sent and exits 2.
Never prints the DSN. Exit 0 sent, 2 no DSN, 3 flush failed.
"""
from __future__ import annotations

import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.env_loader import load_service_env  # noqa: E402


def smoke(env=None, flush_timeout: float = 5.0) -> tuple[bool, str]:
    from observability.sentry_init import init_sentry
    env = os.environ if env is None else env
    if not init_sentry(env):
        return False, "no SENTRY_DSN"
    import sentry_sdk
    event_id = sentry_sdk.capture_message("sentry-smoke")
    flushed = sentry_sdk.flush(timeout=flush_timeout)
    if event_id and flushed is not False:
        return True, f"event {event_id}"
    return False, "flush did not complete"


def main() -> int:
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    sent, why = smoke()
    print(f"sentry-smoke (ml): {'sent' if sent else 'not-sent'} ({why})")
    return 0 if sent else (2 if why == "no SENTRY_DSN" else 3)


if __name__ == "__main__":
    sys.exit(main())
