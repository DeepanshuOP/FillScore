"""Test-session safety: no tracing export and no Sentry, whatever is in ml-service/.env.

Phase 3c found ~2.5K fake observations arriving in Langfuse while pytest ran with the real keys loaded.
FILLSCORE_TRACING=0 is forced (not setdefault) before anything imports observability.tracing."""
import os

os.environ["FILLSCORE_TRACING"] = "0"
os.environ.pop("SENTRY_DSN", None)
