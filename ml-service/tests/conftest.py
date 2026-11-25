"""Test-session safety: no tracing export and no Sentry, whatever is in ml-service/.env.

Phase 3c found ~2.5K fake observations arriving in Langfuse while pytest ran with the real keys loaded.
FILLSCORE_TRACING=0 is forced (not setdefault) before anything imports observability.tracing."""
import os

os.environ["FILLSCORE_TRACING"] = "0"
os.environ.pop("SENTRY_DSN", None)

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _no_database_unless_the_test_provides_one(monkeypatch):
    """The loader's default Mongo client raises at once, so a test never depends on a database that happens to answer
    on this machine (see tests/test_hermetic_database.py). A test that needs one patches `_get_mongo_client` itself."""
    from agents.metrics import loader

    def _none():
        raise RuntimeError("no database in tests: patch agents.metrics.loader._get_mongo_client")

    monkeypatch.setattr(loader, "_get_mongo_client", _none)
